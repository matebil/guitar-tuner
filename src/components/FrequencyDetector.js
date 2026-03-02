/**
 * Matebil Guitar Tuner
 * Copyright (c) 2025 Matebil Limited
 * Licensed under MIT License
 * https://github.com/matebil/guitar-tuner
 */

import { ExpoAudioStreamModule } from '@siteed/expo-audio-studio';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import Pitchfinder from 'pitchfinder';
import { useEffect, useRef, useState } from 'react';
import { calculateCents } from '../utils/audioUtils';
import { logger } from '../utils/logger';

const SAMPLE_RATE = 44100;
const BUFFER_SIZE = 4096;
const MIN_FREQUENCY = 60;
const MAX_FREQUENCY = 400;
const MEDIAN_WIN = 3;          // minimal window — just kills single-sample spikes without freezing
const MEDIAN_MIN_FILL = 2;    // need ≥2 readings before reporting (avoids 1-sample sharp spikes)
const ONSET_RMS_RATIO = 2.5;  // RMS jump ratio that marks a new pluck
const ONSET_SUPPRESS = 1;     // number of buffers to skip after onset (~23 ms)
const SILENCE_RMS = 0.012;    // hard silence gate
const FADE_RMS    = 0.025;    // "dying note" threshold
const FADE_COUNT  = 3;        // consecutive low-energy buffers before clearing note

/**
 * Sub-sample autocorrelation refinement.
 * YIN's 3-point parabolic interpolation on the CMNDF has a systematic bias
 * (~10 cents sharp on B3, ~5 cents on low E) because the CMNDF dip is broad
 * and asymmetric. After YIN gives a rough frequency, we compute the actual
 * autocorrelation at 41 sub-sample lag offsets (±2 samples in steps of 0.1)
 * using linear interpolation of the waveform. The true correlation peak is
 * found with much finer resolution, bringing the error below 1 cent.
 * Cost: ~41 × N/2 multiply-adds ≈ 84k ops — <0.2 ms on iPhone.
 */
function refineFrequency(signal, roughFreq, sampleRate) {
  const roughTau = sampleRate / roughFreq;
  const N = signal.length;
  const halfN = Math.floor(N / 2);
  const STEP = 0.1;
  const RANGE = 2.0;
  let bestTau = roughTau;
  let bestCorr = -Infinity;

  for (let offset = -RANGE; offset <= RANGE; offset += STEP) {
    const tau = roughTau + offset;
    if (tau < 1 || tau >= halfN) continue;
    const tauFloor = Math.floor(tau);
    const frac = tau - tauFloor;
    let corr = 0;
    const limit = Math.min(halfN, N - tauFloor - 1);
    for (let n = 0; n < limit; n++) {
      const delayed = signal[n + tauFloor] * (1 - frac) + signal[n + tauFloor + 1] * frac;
      corr += signal[n] * delayed;
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestTau = tau;
    }
  }
  return sampleRate / bestTau;
}

export default function FrequencyDetector({ 
  onFrequencyDetected,
  currentTuning,
  isActive = false,
  mode = 'auto',
  detectionMode = 'tuning',
  selectedString = null,
  onRawFrequency = () => {},
  onBufferStatus = () => {},
  onSignalLevel = () => {},
  referencePitch = 440,
  yinThreshold = 0.15,
}) {
  const detectPitch = useRef(null);
  const audioBuffer = useRef([]);
  const [streamUuid, setStreamUuid] = useState(null);
  const startTimeRef = useRef(null);
  const firstEventRef = useRef(false);
  const firstDetectionRef = useRef(false);
  const smoothedFrequencyRef = useRef(null);
  const medianBufferRef = useRef([]);
  const prevRmsRef = useRef(0);
  const onsetSuppressRef = useRef(0);
  const fadeCountRef = useRef(0);
  
  // Use refs to keep values current without restarting the audio stream
  const modeRef = useRef(mode);
  const detectionModeRef = useRef(detectionMode);
  const selectedStringRef = useRef(selectedString);
  const currentTuningRef = useRef(currentTuning);
  const referencePitchRef = useRef(referencePitch);
  
  // Update refs when props change
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  
  useEffect(() => {
    detectionModeRef.current = detectionMode;
  }, [detectionMode]);
  
  useEffect(() => {
    selectedStringRef.current = selectedString;
  }, [selectedString]);
  
  useEffect(() => {
    currentTuningRef.current = currentTuning;
  }, [currentTuning]);
  
  useEffect(() => {
    referencePitchRef.current = referencePitch;
  }, [referencePitch]);

  // Initialize pitch detection algorithm
  useEffect(() => {
    detectPitch.current = Pitchfinder.YIN({
      sampleRate: SAMPLE_RATE,
      threshold: yinThreshold,
    });
  }, [yinThreshold]);

  // Audio stream management
  useEffect(() => {
    if (!isActive) return;

    let subscription;
    let currentStreamUuid;

    const startAudioStream = async () => {
      try {
        startTimeRef.current = performance.now();
        firstEventRef.current = false;
        firstDetectionRef.current = false;
        audioBuffer.current = [];
        medianBufferRef.current = [];
        smoothedFrequencyRef.current = null;
        prevRmsRef.current = 0;
        onsetSuppressRef.current = 0;
        fadeCountRef.current = 0;

        const { granted } = await requestRecordingPermissionsAsync();
        if (!granted) { logger.warn('[Tuner] Microphone permission denied'); return; }

        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

        const result = await ExpoAudioStreamModule.startRecording({
          sampleRate: SAMPLE_RATE,
          channels: 1,
          encoding: 'pcm_16bit',
          interval: 25,
          enableProcessing: false,
        });

        currentStreamUuid = result.fileUri;
        setStreamUuid(result.fileUri);

        subscription = ExpoAudioStreamModule.addListener('AudioData', (event) => {
          if (!event.encoded) return;
          try {
            const decoded = atob(event.encoded);
            const bytes = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
            const int16Array = new Int16Array(bytes.buffer);
            const audioData = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) audioData[i] = int16Array[i] / 32768.0;
            if (audioData.length > 0) {
              processAudioData(audioData);
              onBufferStatus({ current: audioBuffer.current.length, needed: BUFFER_SIZE });
            }
          } catch (error) {
            logger.error('[Tuner] Audio decode error:', error);
          }
        });
        
      } catch (error) {
        logger.error('[Tuner] Failed to start audio stream:', error);
      }
    };

    let lastFrequency = null;
    const processAudioData = (floatSamples) => {
      audioBuffer.current.push(...floatSamples);

      if (audioBuffer.current.length >= BUFFER_SIZE) {
        const bufferSlice = audioBuffer.current.slice(0, BUFFER_SIZE);
        audioBuffer.current = audioBuffer.current.slice(-Math.floor(BUFFER_SIZE * 0.5));

        // ── Silence gate ─────────────────────────────────────────────
        let sumSq = 0;
        for (let i = 0; i < bufferSlice.length; i++) sumSq += bufferSlice[i] * bufferSlice[i];
        const rms = Math.sqrt(sumSq / bufferSlice.length);
        onSignalLevel(rms);

        // Hard silence gate
        if (rms < SILENCE_RMS) {
          smoothedFrequencyRef.current = null;
          prevRmsRef.current = 0;
          onsetSuppressRef.current = 0;
          fadeCountRef.current = 0;
          lastFrequency = null;
          onRawFrequency(null);
          onSignalLevel(0);
          onFrequencyDetected({ frequency: null, detectedString: null, detectedNote: null,
            stringNumber: null, targetFrequency: null, centsOff: 0 });
          return;
        }

        // Fast-fade gate: if energy stays low for a few consecutive buffers, clear note
        if (rms < FADE_RMS) {
          fadeCountRef.current++;
          if (fadeCountRef.current >= FADE_COUNT) {
            smoothedFrequencyRef.current = null;
            prevRmsRef.current = 0;
            onsetSuppressRef.current = 0;
            fadeCountRef.current = 0;
            lastFrequency = null;
            onRawFrequency(null);
            onFrequencyDetected({ frequency: null, detectedString: null, detectedNote: null,
              stringNumber: null, targetFrequency: null, centsOff: 0 });
            return;
          }
        } else {
          fadeCountRef.current = 0;
        }

        // ── Onset detection: suppress attack transients ───────────────
        // When RMS jumps sharply (new pluck), the attack phase produces
        // frequencies that are systemically sharp. Skip those buffers.
        if (prevRmsRef.current > 0 && rms > prevRmsRef.current * ONSET_RMS_RATIO) {
          medianBufferRef.current = [];
          smoothedFrequencyRef.current = null;
          onsetSuppressRef.current = ONSET_SUPPRESS;
        }
        // Smooth the RMS tracker so isolated buffer spikes don't re-trigger
        prevRmsRef.current = rms * 0.6 + prevRmsRef.current * 0.4;

        if (onsetSuppressRef.current > 0) {
          onsetSuppressRef.current--;
          return; // still in attack phase — don't report yet
        }

        // ── Zero-phase low-pass at 1200 Hz (kills 17 kHz YIN ghosts) ─
        const K  = Math.tan(Math.PI * 1200 / SAMPLE_RATE);
        const K2 = K * K, sq2K = Math.SQRT2 * K;
        const norm = 1 / (1 + sq2K + K2);
        const b0 = K2 * norm, b1 = 2 * b0, b2 = b0;
        const a1 = 2 * (K2 - 1) * norm, a2 = (1 - sq2K + K2) * norm;
        const fwd = new Float32Array(bufferSlice.length);
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < bufferSlice.length; i++) {
          const x0 = bufferSlice[i];
          fwd[i] = b0*x0 + b1*x1 + b2*x2 - a1*y1 - a2*y2;
          x2 = x1; x1 = x0; y2 = y1; y1 = fwd[i];
        }
        const filtered = new Float32Array(bufferSlice.length);
        x1 = 0; x2 = 0; y1 = 0; y2 = 0;
        for (let i = bufferSlice.length - 1; i >= 0; i--) {
          const x0 = fwd[i];
          filtered[i] = b0*x0 + b1*x1 + b2*x2 - a1*y1 - a2*y2;
          x2 = x1; x1 = x0; y2 = y1; y1 = filtered[i];
        }

        // ── Pitch detection: YIN → sub-sample refinement ─────────────
        let frequency = detectPitch.current(filtered);

        // Reject ultrasonic garbage
        if (frequency && frequency > 1000) return;

        // Sub-sample autocorrelation refinement on the FILTERED signal
        // Uses the same low-passed signal YIN used — avoids sharp bias from
        // high-frequency harmonics pulling the ACF peak upward.
        if (frequency && frequency >= MIN_FREQUENCY && frequency <= MAX_FREQUENCY) {
          frequency = refineFrequency(filtered, frequency, SAMPLE_RATE);
        }

        // Sub-octave harmonic correction for low E (halve if lands in E2 territory)
        if (frequency) {
          const half = frequency / 2;
          if (half >= 75 && half <= 90) frequency = half;
        }

        // ── Median filter (window=3): removes isolated spikes, tracks live drift ─
        if (frequency) {
          const prev = smoothedFrequencyRef.current;
          if (prev !== null && Math.abs(frequency - prev) / prev > 0.06) {
            // New note detected — reset median buffer
            medianBufferRef.current = [];
            smoothedFrequencyRef.current = null;
          }
          medianBufferRef.current = [...medianBufferRef.current.slice(-(MEDIAN_WIN - 1)), frequency];

          // Don't report until we have enough samples for a meaningful median
          if (medianBufferRef.current.length < MEDIAN_MIN_FILL) return;

          const sorted = [...medianBufferRef.current].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          frequency = sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

          // Track last value for note-transition detection only (no EMA — it freezes output)
          smoothedFrequencyRef.current = frequency;
        } else {
          smoothedFrequencyRef.current = null;
          medianBufferRef.current = [];
        }

        if (frequency) {
          onRawFrequency(frequency);
          if (lastFrequency && Math.abs(frequency - lastFrequency) > 10) audioBuffer.current = [];
          lastFrequency = frequency;
        } else {
          lastFrequency = null;
          onRawFrequency(null);
          onFrequencyDetected({ frequency: null, detectedString: null, detectedNote: null,
            stringNumber: null, targetFrequency: null, centsOff: 0 });
        }

        if (frequency && frequency >= MIN_FREQUENCY && frequency <= MAX_FREQUENCY) {
          analyzeFrequency(frequency);
        }
      }
    };

    const analyzeFrequency = (frequency) => {
      // Adjust tuning frequencies based on reference pitch (default 440Hz)
      const pitchRatio = referencePitchRef.current / 440;
      
      // Find which string this matches
      let matchedString = null;
      
      if (modeRef.current === 'manual' && selectedStringRef.current) {
        // Manual mode in tuning: ALWAYS use the selected string's open note
        const targetString = currentTuningRef.current.strings.find(s => s.stringNumber === selectedStringRef.current);
        if (targetString) {
          const adjustedFrequency = targetString.frequency * pitchRatio;
          matchedString = {
            ...targetString,
            targetFrequency: adjustedFrequency,
          };
        }
      } else if (detectionModeRef.current === 'intonation' && selectedStringRef.current) {
        // Intonation mode with selected string: only consider frets on THAT string
        matchedString = findClosestFretOnString(frequency, currentTuningRef.current, pitchRatio, selectedStringRef.current);
      } else {
        // Auto mode: find closest string/position with adjusted frequencies
        matchedString = findClosestStringWithPitch(frequency, currentTuningRef.current, pitchRatio);
      }
      
      if (!matchedString) {
        // No string in range — clear the display so note doesn't stay stuck
        onFrequencyDetected({ frequency: null, detectedString: null, detectedNote: null,
          stringNumber: null, targetFrequency: null, centsOff: 0 });
        return;
      }
      
      // Calculate how far off we are
      const centsOff = calculateCents(frequency, matchedString.targetFrequency);
      
      // In manual mode, always update regardless of range
      // In auto mode, only update if within reasonable range
      if (modeRef.current === 'manual' || Math.abs(centsOff) < 100) {
        onFrequencyDetected({
          frequency: parseFloat(frequency.toFixed(2)),
          detectedString: matchedString.name,
          detectedNote: matchedString.note,
          actualNote: matchedString.actualNote || matchedString.name,  // Clean note name
          stringNumber: matchedString.stringNumber,
          fret: matchedString.fret ?? 0,  // Include fret number
          targetFrequency: matchedString.targetFrequency,
          centsOff: Math.round(centsOff),
        });
      }
    };
    
    // Helper function to find closest string with pitch adjustment
    const findClosestStringWithPitch = (frequency, tuning, pitchRatio) => {
      if (!frequency || !tuning) return null;
      
      // Choose which positions to search based on detection mode
      const positions = detectionModeRef.current === 'tuning' 
        ? tuning.strings  // Only open strings for tuning mode
        : tuning.allPositions;  // All fret positions for intonation mode
      
      if (!positions) return null;

      let bestMatch = null;
      let minDistance = Infinity;

      positions.forEach((position) => {
        const adjustedFrequency = position.frequency * pitchRatio;
        // Calculate frequency range for this position (±100 cents = 1 semitone)
        const semitoneRatio = Math.pow(2, 1/12);
        const centsRange = 1.0; // ±100 cents = 1 full semitone
        const lowerBound = adjustedFrequency / Math.pow(semitoneRatio, centsRange);
        const upperBound = adjustedFrequency * Math.pow(semitoneRatio, centsRange);
        
        // Check if frequency falls within this position's range
        if (frequency >= lowerBound && frequency <= upperBound) {
          const distance = Math.abs(frequency - adjustedFrequency);
          
          if (distance < minDistance) {
            minDistance = distance;
            bestMatch = {
              ...position,
              targetFrequency: adjustedFrequency,
            };
          }
        }
      });

      return bestMatch;
    };
    
    // Helper function to find closest fret on a specific string (for intonation mode)
    const findClosestFretOnString = (frequency, tuning, pitchRatio, stringNumber) => {
      if (!frequency || !tuning?.allPositions) return null;
      
      // Filter positions to only include frets on the selected string
      const stringPositions = tuning.allPositions.filter(p => p.stringNumber === stringNumber);
      
      if (!stringPositions.length) return null;

      let bestMatch = null;
      let minDistance = Infinity;

      stringPositions.forEach((position) => {
        const adjustedFrequency = position.frequency * pitchRatio;
        // Use wider range for intonation (±100 cents = 1 semitone)
        const semitoneRatio = Math.pow(2, 1/12);
        const centsRange = 1.0;
        const lowerBound = adjustedFrequency / Math.pow(semitoneRatio, centsRange);
        const upperBound = adjustedFrequency * Math.pow(semitoneRatio, centsRange);
        
        if (frequency >= lowerBound && frequency <= upperBound) {
          const distance = Math.abs(frequency - adjustedFrequency);
          
          if (distance < minDistance) {
            minDistance = distance;
            bestMatch = {
              ...position,
              targetFrequency: adjustedFrequency,
            };
          }
        }
      });

      return bestMatch;
    };

    startAudioStream();

    // Cleanup on unmount
    return () => {
      if (subscription) {
        subscription.remove();
      }
      if (currentStreamUuid) {
        ExpoAudioStreamModule.stopRecording().catch(logger.error);
      }
    };
  }, [isActive]); // Only restart when isActive changes - refs keep other values current

  return null; // This component doesn't render anything
}
