import { useSettings } from '@/src/contexts/SettingsContext';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MetronomeScreen() {
  const { getThemeColors } = useSettings();
  const colors = getThemeColors();
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [audioReady, setAudioReady] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const clickSound = useRef<AudioPlayer | null>(null);
  const accentSound = useRef<AudioPlayer | null>(null);
  const nextBeatTimeRef = useRef<number>(0);
  const currentBeatRef = useRef<number>(0);
  const bpmRef = useRef<number>(120);
  const beatsPerMeasureRef = useRef<number>(4);

  // Stop metronome when leaving the tab (tabs don't unmount)
  useFocusEffect(
    useCallback(() => {
      return () => {
        stopMetronome();
      };
    }, [])
  );

  // Keep refs in sync with state
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    beatsPerMeasureRef.current = beatsPerMeasure;
  }, [beatsPerMeasure]);

  // Load sounds on mount
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
          shouldPlayInBackground: false,
          interruptionMode: 'mixWithOthers',
          shouldRouteThroughEarpiece: false,
        });
      } catch (_) {}
      try {
        await loadSounds();
      } catch (_) {}
      setAudioReady(true); // Always mark ready
    };
    setupAudio();
    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
      if (clickSound.current) {
        clickSound.current.remove();
      }
      if (accentSound.current) {
        accentSound.current.remove();
      }
    };
  }, []);

  const loadSounds = async () => {
    const click = createAudioPlayer(require('../../assets/sounds/metronome/tick.wav'));
    click.volume = 1;
    clickSound.current = click;
    const accent = createAudioPlayer(require('../../assets/sounds/metronome/tock.wav'));
    accent.volume = 1;
    accentSound.current = accent;
  };

  const playClick = (isAccent: boolean) => {
    try {
      const sound = isAccent ? accentSound.current : clickSound.current;
      if (sound) {
        sound.seekTo(0).then(() => sound.play()).catch(() => {});
      }
    } catch (_) {}
  };

  const startMetronome = async () => {
    if (!audioReady) return;
    if (isPlaying) { stopMetronome(); return; }

    // Re-apply playback mode — tuner tab sets allowsRecording:true which breaks playback
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        shouldPlayInBackground: false,
        interruptionMode: 'mixWithOthers',
        shouldRouteThroughEarpiece: false,
      });
    } catch (_) {}

    setIsPlaying(true);
    currentBeatRef.current = 0;
    setCurrentBeat(0);
    
    nextBeatTimeRef.current = performance.now();

    const tick = () => {
      // Play the click
      playClick(currentBeatRef.current === 0);
      setCurrentBeat(currentBeatRef.current);
      currentBeatRef.current = (currentBeatRef.current + 1) % beatsPerMeasureRef.current;
      
      // Calculate precise timing for next beat using current BPM
      const interval = 60000 / bpmRef.current;
      nextBeatTimeRef.current += interval;
      const delay = nextBeatTimeRef.current - performance.now();
      
      // Always schedule next beat with calculated delay
      intervalRef.current = setTimeout(tick, Math.max(0, delay));
    };

    tick(); // Start immediately
  };

  const stopMetronome = () => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlaying(false);
    setCurrentBeat(0);
    currentBeatRef.current = 0;
  };

  const adjustBpm = (delta: number) => {
    const newBpm = Math.max(40, Math.min(240, bpm + delta));
    setBpm(newBpm);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.primary }]}>Metronome</Text>
      </View>

      {/* BPM Display */}
      <View style={styles.bpmContainer}>
        <TouchableOpacity
          style={[styles.bpmButton, { backgroundColor: colors.buttonBg, borderColor: colors.buttonBorder }]}
          onPress={() => adjustBpm(-1)}
          onLongPress={() => adjustBpm(-10)}
        >
          <Text style={[styles.bpmButtonText, { color: colors.primary }]}>−</Text>
        </TouchableOpacity>

        <View style={styles.bpmDisplay}>
          <Text style={[styles.bpmValue, { color: colors.primary }]}>{bpm}</Text>
          <Text style={[styles.bpmLabel, { color: colors.textSecondary }]}>BPM</Text>
        </View>

        <TouchableOpacity
          style={[styles.bpmButton, { backgroundColor: colors.buttonBg, borderColor: colors.buttonBorder }]}
          onPress={() => adjustBpm(1)}
          onLongPress={() => adjustBpm(10)}
        >
          <Text style={[styles.bpmButtonText, { color: colors.primary }]}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Beat Indicator */}
      <View style={styles.beatIndicator}>
        {Array.from({ length: beatsPerMeasure }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.beatDot,
              { backgroundColor: colors.buttonBg, borderColor: colors.buttonBorder },
              currentBeat === index && isPlaying && { backgroundColor: colors.primary, borderColor: colors.primary },
              index === 0 && styles.beatDotAccent,
            ]}
          />
        ))}
      </View>

      {/* Quick Tempo Selector */}
      <View style={styles.presetSection}>
        <Text style={[styles.presetsLabel, { color: colors.textSecondary }]}>Quick Tempo</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetCarousel}
          style={styles.presetScroll}
        >
          {[40, 60, 72, 80, 92, 100, 112, 120, 132, 140, 152, 160, 176, 180, 200, 208, 240].map((preset) => (
            <TouchableOpacity
              key={preset}
              style={[
                styles.presetChip,
                { backgroundColor: colors.buttonBg, borderColor: colors.buttonBorder },
                bpm === preset && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setBpm(preset)}
            >
              <Text style={[
                styles.presetChipText,
                { color: colors.textSecondary },
                bpm === preset && { color: colors.textOnPrimary, fontWeight: '700' },
              ]}>{preset}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Time Signature Selector */}
      <View style={styles.timeSignature}>
        <Text style={[styles.timeSignatureLabel, { color: colors.textSecondary }]}>Time Signature</Text>
        <View style={styles.timeSignatureButtons}>
          {[3, 4, 5, 6].map((beats) => (
            <TouchableOpacity
              key={beats}
              style={[
                styles.timeSignatureButton,
                { backgroundColor: colors.buttonBg, borderColor: colors.buttonBorder },
                beatsPerMeasure === beats && { backgroundColor: colors.primary, borderColor: colors.primary }
              ]}
              onPress={() => {
                setBeatsPerMeasure(beats);
                if (currentBeatRef.current >= beats) {
                  currentBeatRef.current = 0;
                  setCurrentBeat(0);
                }
              }}
            >
              <Text style={[
                styles.timeSignatureButtonText,
                { color: colors.textSecondary },
                beatsPerMeasure === beats && { color: colors.textOnPrimary, fontWeight: 'bold' }
              ]}>
                {beats}/4
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Play/Stop Button */}
      <TouchableOpacity
        style={[
          styles.playButton,
          { backgroundColor: colors.secondary, borderColor: colors.primary },
          isPlaying && { backgroundColor: '#5c1a1a', borderColor: colors.sharp }
        ]}
        onPress={startMetronome}
      >
        <Text style={[styles.playButtonText, { color: isPlaying ? colors.sharp : colors.primary }]}>
          {isPlaying ? 'STOP' : 'START'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  bpmContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  bpmButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bpmButtonText: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  bpmDisplay: {
    alignItems: 'center',
    marginHorizontal: 40,
  },
  bpmValue: {
    fontSize: 72,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  bpmLabel: {
    fontSize: 16,
    marginTop: 5,
  },
  beatIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 15,
  },
  beatDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  beatDotAccent: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  timeSignature: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  timeSignatureLabel: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '600',
  },
  timeSignatureButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  timeSignatureButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
  },
  timeSignatureButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  playButton: {
    marginHorizontal: 40,
    marginTop: 28,
    marginBottom: 14,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 3,
    alignItems: 'center',
  },
  playButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  presetSection: {
    paddingTop: 20,
  },
  presetsLabel: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
  presetScroll: {
    flexGrow: 0,
    marginBottom: 2,
  },
  presetCarousel: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  presetChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
