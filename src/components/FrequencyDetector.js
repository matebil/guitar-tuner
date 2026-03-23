/**
 * Matebil Guitar Tuner
 * Copyright (c) 2025 Matebil Limited
 * Licensed under MIT License
 * https://github.com/matebil/guitar-tuner
 */

import { ExpoAudioStreamModule } from '@siteed/expo-audio-studio';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import Pitchfinder from 'pitchfinder';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { calculateCents } from '../utils/audioUtils';
import { logger } from '../utils/logger';

const SAMPLE_RATE = 44100;
const BUFFER_SIZE = 4096;
const ANDROID_SAMPLE_RATE = 16000;
const ANDROID_BUFFER_SIZE = 1536;
const MIN_FREQUENCY = 60;
const MAX_FREQUENCY = 1400; // Full guitar range: low E2 (82 Hz) to high e fret 24 (1318 Hz)
const INPUT_GAIN  = 6;         // Pre-gain boost — makes acoustic/unplugged guitar as readable as Guitar Tuna
const INPUT_GAIN_ANDROID = 6;  // Keep Android gain moderate to avoid clipping and YIN failures
const MEDIAN_WIN = 3;          // minimal window — just kills single-sample spikes without freezing
const MEDIAN_MIN_FILL = 1;    // report on first valid pitch reading — no need to wait for 2
const ONSET_RMS_RATIO = 2.5;  // RMS jump ratio that marks a new pluck
const ONSET_SUPPRESS = 1;     // number of buffers to skip after onset (~23 ms)
// Post-gain (×6) levels guide:
//   True silence / mic floor  : ~0.002–0.008
//   Keyboard / ambient noise  : ~0.010–0.020
//   Fading acoustic guitar    : ~0.025–0.060
//   Normal acoustic playing   : ~0.060–0.200
const SILENCE_RMS     = 0.012;  // hard silence gate — clears true silence & mic floor immediately
const FADE_RMS        = 0.028;  // dying-note zone — above ambient, below fading guitar
const FADE_RESET_RMS  = 0.060;  // only reset fade counter if signal this strong (genuine new note)
const FADE_COUNT      = 2;      // buffers without strong signal before clearing (~140 ms)
const ANDROID_SILENCE_RMS = 0.0035;
const ANDROID_FADE_RMS = 0.010;
const ANDROID_FADE_RESET_RMS = 0.025;

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
  const startTimeRef = useRef(null);
  const firstEventRef = useRef(false);
  const firstDetectionRef = useRef(false);
  const lastReportedCentsRef = useRef(null);
  const lastReportedFrequencyRef = useRef(null);
  const lastLockedStringRef = useRef(null);
  const smoothedFrequencyRef = useRef(null);
  const medianBufferRef = useRef([]);
  const prevRmsRef = useRef(0);
  const onsetSuppressRef = useRef(0);
  const fadeCountRef = useRef(0);
  const sampleRateRef = useRef(SAMPLE_RATE);
  const bufferSizeRef = useRef(BUFFER_SIZE);
  const bufferEvalCountRef = useRef(0);
  
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
    const targetSampleRate = Platform.OS === 'android' ? ANDROID_SAMPLE_RATE : SAMPLE_RATE;
    detectPitch.current = Pitchfinder.YIN({
      sampleRate: targetSampleRate,
      threshold: yinThreshold,
    });
  }, [yinThreshold]);

  // Audio stream management
  useEffect(() => {
    if (!isActive) return;

    let subscription;
    let isStreamActive = false;  // guard: tracks if OUR stream is running
    let startAborted = false;    // guard: prevents race when effect re-runs

    const startAudioStream = async () => {
      try {
        // Stop any previous recording gracefully — ignore error if none was running
        if (isStreamActive) {
          try { await ExpoAudioStreamModule.stopRecording(); } catch (_) {}
          isStreamActive = false;
        } else {
          // Attempt to stop a stale stream from a previous mount
          try { await ExpoAudioStreamModule.stopRecording(); } catch (_) {}
        }

        // Delete ALL leftover .wav files from previous sessions / crashes.
        // The library writes continuous WAV to Documents (~5 MB/min) and
        // never cleans up automatically.  This single call prevents
        // unbounded disk growth even after force-quits.
        try { ExpoAudioStreamModule.clearAudioFiles(); } catch (_) {}

        await new Promise(resolve => setTimeout(resolve, 150));

        if (startAborted) return;  // effect was cleaned up while we waited

        startTimeRef.current = performance.now();
        firstEventRef.current = false;
        firstDetectionRef.current = false;
        audioBuffer.current = [];
        medianBufferRef.current = [];
        smoothedFrequencyRef.current = null;
        prevRmsRef.current = 0;
        onsetSuppressRef.current = 0;
        fadeCountRef.current = 0;
        bufferEvalCountRef.current = 0;

        const permissionState = await getRecordingPermissionsAsync();
        let granted = permissionState.granted;
        if (!granted && permissionState.canAskAgain) {
          const requested = await requestRecordingPermissionsAsync();
          granted = requested.granted;
        }
        logger.info('[Tuner] Microphone permission granted:', granted, 'Platform:', Platform.OS);
        if (!granted) { logger.warn('[Tuner] Microphone permission denied'); return; }
        if (startAborted) return;

        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        if (startAborted) return;

        // On low-end Android devices the JS thread (Hermes on Helio P35 etc.)
        // cannot keep up with 40 events/sec of atob + DSP at 25 ms interval.
        // 100 ms emits ~4410 samples/event — enough to fill one 4096-sample
        // buffer per callback, and leaves the JS thread breathing room.
        const streamInterval = Platform.OS === 'android' ? 45 : 25;
        const targetSampleRate = Platform.OS === 'android' ? ANDROID_SAMPLE_RATE : SAMPLE_RATE;
        const targetBufferSize = Platform.OS === 'android' ? ANDROID_BUFFER_SIZE : BUFFER_SIZE;
        logger.info('[Tuner] Starting audio stream, interval:', streamInterval, 'ms');
        const startResult = await ExpoAudioStreamModule.startRecording({
          sampleRate: targetSampleRate,
          channels: 1,
          encoding: 'pcm_16bit',
          interval: streamInterval,
          enableProcessing: false,
        });
        const runtimeSampleRate = startResult?.sampleRate || SAMPLE_RATE;
        sampleRateRef.current = runtimeSampleRate;
        bufferSizeRef.current = targetBufferSize;
        detectPitch.current = Pitchfinder.YIN({
          sampleRate: runtimeSampleRate,
          threshold: yinThreshold,
        });
        logger.info('[Tuner] Audio stream started successfully');
        logger.info('[Tuner] Runtime stream config sampleRate:', runtimeSampleRate, 'channels:', startResult?.channels);

        if (startAborted) {
          // Cleanup immediately if effect was torn down during startRecording
          try { await ExpoAudioStreamModule.stopRecording(); } catch (_) {}
          return;
        }

        isStreamActive = true;

        let eventCount = 0;
        subscription = ExpoAudioStreamModule.addListener('AudioData', (event) => {
          if (!event.encoded) {
            if (eventCount === 0) logger.info('[Tuner] AudioData event with no encoded data');
            return;
          }
          eventCount++;
          if (eventCount <= 3 || eventCount % 300 === 0) {
            logger.info('[Tuner] AudioData event #' + eventCount + ', encoded length:', event.encoded.length);
          }
          try {
            const decoded = atob(event.encoded);
            const bytes = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
            const int16Array = new Int16Array(bytes.buffer);
            const audioData = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) audioData[i] = int16Array[i] / 32768.0;
            // Boost quiet signals (acoustic/unplugged guitar) to match commercial tuner sensitivity
            const gain = Platform.OS === 'android' ? INPUT_GAIN_ANDROID : INPUT_GAIN;
            for (let i = 0; i < audioData.length; i++) {
              audioData[i] = audioData[i] * gain;
              if (audioData[i] > 1) audioData[i] = 1;
              else if (audioData[i] < -1) audioData[i] = -1;
            }
            if (audioData.length > 0) {
              processAudioData(audioData);
              onBufferStatus({ current: audioBuffer.current.length, needed: bufferSizeRef.current });
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
      const activeBufferSize = bufferSizeRef.current || BUFFER_SIZE;
      // Accumulate incoming samples
      const combined = new Float32Array(audioBuffer.current.length + floatSamples.length);
      combined.set(audioBuffer.current);
      combined.set(floatSamples, audioBuffer.current.length);
      audioBuffer.current = combined;

      if (audioBuffer.current.length >= activeBufferSize) {
        // ALWAYS take the NEWEST BUFFER_SIZE samples — prevents latency building up
        // when the JS thread falls behind (GC pause, tab switch, etc.).
        // Any samples older than BUFFER_SIZE are stale and will only add delay.
        const isBacklogged = audioBuffer.current.length > activeBufferSize;
        const bufferSlice = isBacklogged
          ? audioBuffer.current.slice(-activeBufferSize)
          : audioBuffer.current.slice(0, activeBufferSize);
        // When backlogged: clear completely so we catch up in one cycle.
        // When normal: keep a 25% overlap (~1024 samples) for continuity.
        audioBuffer.current = isBacklogged
          ? new Float32Array(0)
          : audioBuffer.current.slice(-Math.floor(activeBufferSize * 0.25));
        // ── Silence gate ─────────────────────────────────────────────
        let sumSq = 0;
        for (let i = 0; i < bufferSlice.length; i++) sumSq += bufferSlice[i] * bufferSlice[i];
        const rms = Math.sqrt(sumSq / bufferSlice.length);
        onSignalLevel(rms);

        const silenceGate = Platform.OS === 'android' ? ANDROID_SILENCE_RMS : SILENCE_RMS;
        const fadeGate = Platform.OS === 'android' ? ANDROID_FADE_RMS : FADE_RMS;
        const fadeResetGate = Platform.OS === 'android' ? ANDROID_FADE_RESET_RMS : FADE_RESET_RMS;

        // Hard silence gate
        if (rms < silenceGate) {
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

        // Fast-fade gate: count buffers without a strong signal.
        // Only reset the counter when signal is clearly a new strong note (rms > FADE_RESET_RMS).
        // Bounces in the dying-note zone (FADE_RMS..FADE_RESET_RMS) intentionally do NOT reset,
        // so a decaying acoustic string clears in ~2 buffers instead of lingering for seconds.
        if (rms >= fadeResetGate) {
          fadeCountRef.current = 0; // strong new note — reset
        } else {
          // rms is below fadeResetGate (dying or silent) — always increment
          if (rms < fadeGate) {
            fadeCountRef.current++;
          }
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

        // ── Zero-phase high-pass at 80 Hz (removes 50/60 Hz amp hum) ─
        const runtimeSampleRate = sampleRateRef.current || SAMPLE_RATE;
        const K_hp = Math.tan(Math.PI * 80 / runtimeSampleRate);
        const K2_hp = K_hp * K_hp, sq2K_hp = Math.SQRT2 * K_hp;
        const norm_hp = 1 / (1 + sq2K_hp + K2_hp);
        const b0_hp = norm_hp, b1_hp = -2 * norm_hp, b2_hp = norm_hp;
        const a1_hp = 2 * (K2_hp - 1) * norm_hp, a2_hp = (1 - sq2K_hp + K2_hp) * norm_hp;
        const hpFwd = new Float32Array(bufferSlice.length);
        let hx1 = 0, hx2 = 0, hy1 = 0, hy2 = 0;
        for (let i = 0; i < bufferSlice.length; i++) {
          const x0 = bufferSlice[i];
          hpFwd[i] = b0_hp*x0 + b1_hp*hx1 + b2_hp*hx2 - a1_hp*hy1 - a2_hp*hy2;
          hx2 = hx1; hx1 = x0; hy2 = hy1; hy1 = hpFwd[i];
        }
        const hpFiltered = new Float32Array(bufferSlice.length);
        hx1 = 0; hx2 = 0; hy1 = 0; hy2 = 0;
        for (let i = bufferSlice.length - 1; i >= 0; i--) {
          const x0 = hpFwd[i];
          hpFiltered[i] = b0_hp*x0 + b1_hp*hx1 + b2_hp*hx2 - a1_hp*hy1 - a2_hp*hy2;
          hx2 = hx1; hx1 = x0; hy2 = hy1; hy1 = hpFiltered[i];
        }

        // ── Zero-phase low-pass at 1200 Hz (kills 17 kHz YIN ghosts) ─
        const K  = Math.tan(Math.PI * 1200 / runtimeSampleRate);
        const K2 = K * K, sq2K = Math.SQRT2 * K;
        const norm = 1 / (1 + sq2K + K2);
        const b0 = K2 * norm, b1 = 2 * b0, b2 = b0;
        const a1 = 2 * (K2 - 1) * norm, a2 = (1 - sq2K + K2) * norm;
        const fwd = new Float32Array(bufferSlice.length);
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < bufferSlice.length; i++) {
          const x0 = hpFiltered[i]; // feed HP output into LP
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

        // Reject out-of-range frequencies
        if (frequency && frequency > MAX_FREQUENCY) return;

        // Sub-sample autocorrelation refinement on the FILTERED signal
        // Uses the same low-passed signal YIN used — avoids sharp bias from
        // high-frequency harmonics pulling the ACF peak upward.
        if (frequency && frequency >= MIN_FREQUENCY && frequency <= MAX_FREQUENCY) {
          frequency = refineFrequency(filtered, frequency, runtimeSampleRate);
        }

        bufferEvalCountRef.current++;
        if (Platform.OS === 'android' && (bufferEvalCountRef.current <= 3 || bufferEvalCountRef.current % 180 === 0)) {
          logger.info('[Tuner] DSP rms:', Number(rms.toFixed(4)), 'gate:', silenceGate, 'freq:', frequency ? Number(frequency.toFixed(2)) : null);
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
          lastReportedCentsRef.current = null;
          lastReportedFrequencyRef.current = null;
          lastLockedStringRef.current = null;
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
        lastReportedCentsRef.current = null;
        lastReportedFrequencyRef.current = null;
        lastLockedStringRef.current = null;
        // No string in range — clear the display so note doesn't stay stuck
        onFrequencyDetected({ frequency: null, detectedString: null, detectedNote: null,
          stringNumber: null, targetFrequency: null, centsOff: 0 });
        return;
      }

      if (
        Platform.OS === 'android' &&
        matchedString.stringNumber === 1 &&
        matchedString.targetFrequency >= 320
      ) {
        if (lastLockedStringRef.current !== matchedString.stringNumber) {
          lastReportedFrequencyRef.current = frequency;
        }
        lastLockedStringRef.current = matchedString.stringNumber;

        const prevFrequency = lastReportedFrequencyRef.current;
        if (typeof prevFrequency === 'number' && Number.isFinite(prevFrequency)) {
          const prevCentsToTarget = calculateCents(prevFrequency, matchedString.targetFrequency);
          const rawCentsToTarget = calculateCents(frequency, matchedString.targetFrequency);
          let stabilizedFrequency = frequency;

          // If we're near tune and current frame jumps too far, treat it as a transient glitch.
          if (Math.abs(prevCentsToTarget) <= 30 && Math.abs(rawCentsToTarget - prevCentsToTarget) >= 28) {
            stabilizedFrequency = prevFrequency;
          }

          // Only clamp jumps when previous value is already in the same neighborhood.
          if (Math.abs(prevCentsToTarget) <= 120) {
            const maxDeltaHz = 1.2;
            const deltaHz = stabilizedFrequency - prevFrequency;
            if (Math.abs(deltaHz) > maxDeltaHz) {
              stabilizedFrequency = prevFrequency + Math.sign(deltaHz) * maxDeltaHz;
            }
          }

          frequency = (prevFrequency * 0.6) + (stabilizedFrequency * 0.4);
        }

        // Snap tiny residual wobble to target so high E can settle in green.
        const stabilizedCents = calculateCents(frequency, matchedString.targetFrequency);
        if (Math.abs(stabilizedCents) <= 3) {
          frequency = matchedString.targetFrequency;
        }
      }
      
      if (lastLockedStringRef.current !== matchedString.stringNumber) {
        lastLockedStringRef.current = matchedString.stringNumber;
      }
      lastReportedFrequencyRef.current = frequency;
      
      // Calculate how far off we are
      const centsOffRaw = calculateCents(frequency, matchedString.targetFrequency);
      const centsBias = (
        Platform.OS === 'android' &&
        detectionModeRef.current === 'tuning' &&
        matchedString.stringNumber === 1 &&
        matchedString.targetFrequency >= 320
      ) ? 3 : 0;
      const centsOff = centsOffRaw - centsBias;
      let displayedCents = Math.round(centsOff);

      if (Platform.OS === 'android' && matchedString.stringNumber === 1) {
        const prev = lastReportedCentsRef.current;
        if (typeof prev === 'number') {
          displayedCents = Math.round((prev * 0.65) + (displayedCents * 0.35));
        }
        if (Math.abs(displayedCents) <= 2) {
          displayedCents = 0;
        }
      }
      lastReportedCentsRef.current = displayedCents;
      
      // In manual mode, always update regardless of range
      // In auto mode, only update if within reasonable range
      const maxCentsForUpdate = Platform.OS === 'android' ? 180 : 100;
      if (modeRef.current === 'manual' || Math.abs(centsOff) < maxCentsForUpdate) {
        onFrequencyDetected({
          frequency: parseFloat(frequency.toFixed(2)),
          detectedString: matchedString.name,
          detectedNote: matchedString.note,
          actualNote: matchedString.actualNote || matchedString.name,  // Clean note name
          stringNumber: matchedString.stringNumber,
          fret: matchedString.fret ?? 0,  // Include fret number
          targetFrequency: matchedString.targetFrequency,
          centsOff: displayedCents,
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
        const centsRange = Platform.OS === 'android' ? 1.8 : 1.0; // Wider tolerance on old Android mics
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
        const centsRange = Platform.OS === 'android' ? 1.8 : 1.0;
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

    // Cleanup on unmount or when isActive becomes false
    return () => {
      startAborted = true;
      if (subscription) {
        subscription.remove();
      }
      if (isStreamActive) {
        isStreamActive = false;
        ExpoAudioStreamModule.stopRecording()
          .then(() => {
            // Delete ALL recording files — covers the current one plus any
            // stragglers left by previous sessions or race conditions.
            try { ExpoAudioStreamModule.clearAudioFiles(); } catch (_) {}
          })
          .catch(() => {
            // stopRecording failed, still try to clean up files
            try { ExpoAudioStreamModule.clearAudioFiles(); } catch (_) {}
          });
      }
    };
  }, [isActive]); // Only restart when isActive changes - refs keep other values current

  return null; // This component doesn't render anything
}
