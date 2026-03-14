import FrequencyDetector from '@/src/components/FrequencyDetector';
import TuningBar from '@/src/components/TuningBar';
import { DEFAULT_TUNING, TUNINGS } from '@/src/constants/tunings';
import { useSettings } from '@/src/contexts/SettingsContext';
import { logger } from '@/src/utils/logger';
import { setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const { settings, getThemeColors } = useSettings();
  const colors = getThemeColors();
  const [selectedTuning, setSelectedTuning] = useState(DEFAULT_TUNING);
  const [isListening, setIsListening] = useState(true);
  const [mode, setMode] = useState('auto'); // 'auto' or 'manual'
  const [detectionMode, setDetectionMode] = useState<'tuning' | 'intonation'>('tuning'); // 'tuning' or 'intonation'
  const [selectedString, setSelectedString] = useState(null); // For manual mode
  const [rawFrequency, setRawFrequency] = useState(null);
  const [bufferStatus, setBufferStatus] = useState({ current: 0, needed: 0 });
  const isListeningRef = useRef(isListening);
  const hasFrequencyRef = useRef(false);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  const [isDetecting, setIsDetecting] = useState(false); // For manual mode blinking
  const [detectionData, setDetectionData] = useState({
    frequency: null,
    detectedString: null,
    detectedNote: null,
    actualNote: null,
    stringNumber: null,
    fret: null,
    targetFrequency: null,
    centsOff: 0,
  });
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const wasInTuneRef = useRef(false);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Setup audio mode when screen is focused (and stop when unfocused)
  useFocusEffect(
    useCallback(() => {
      setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        shouldPlayInBackground: false,
        interruptionMode: 'doNotMix',
        shouldRouteThroughEarpiece: false,
      }).catch((e) => logger.error('Audio setup error:', e));
      setIsListening(true);

      return () => {
        setIsListening(false);
      };
    }, [])
  );

  // Stop the microphone when the app goes to the background
  const isFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      return () => { isFocusedRef.current = false; };
    }, [])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (!isFocusedRef.current) return; // Only act when this screen is the active tab
      if (nextState === 'background' || nextState === 'inactive') {
        setIsListening(false);
      } else if (nextState === 'active') {
        setIsListening(true);
      }
    });
    return () => subscription.remove();
  }, []);

  // Start/stop blinking animation
  useEffect(() => {
    if (isDetecting && mode === 'manual') {
      animationRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(blinkAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      );
      animationRef.current.start();
    } else {
      if (animationRef.current) {
        animationRef.current.stop();
      }
      blinkAnim.setValue(1);
    }
    
    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [isDetecting, mode]);

  const handleFrequencyDetected = (data: any) => {
    // If no frequency, clear the display immediately
    if (!data.frequency) {
      hasFrequencyRef.current = false;
      setDetectionData({
        frequency: null,
        detectedString: null,
        detectedNote: null,
        actualNote: null,
        stringNumber: null,
        fret: null,
        targetFrequency: null,
        centsOff: 0,
      });
      setIsDetecting(false);
      wasInTuneRef.current = false;
      return;
    }
    
    // We have a frequency - update display
    hasFrequencyRef.current = true;
    setDetectionData(data);
    
    // Track if we're detecting something in manual mode or intonation mode with selected string
    if ((mode === 'manual' || detectionMode === 'intonation') && selectedString) {
      setIsDetecting(true);
    }
    
    // Play sound when first becoming in tune
    const isInTune = data.detectedString && Math.abs(data.centsOff) < 5;
    if (isInTune && !wasInTuneRef.current) {
      playInTuneSound();
    }
    wasInTuneRef.current = isInTune;
  };

  // Haptic feedback when in tune (avoids audio session conflicts with recording)
  const playInTuneSound = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.primary }]}>TUNER</Text>
      </View>

      {/* Detection Mode Toggle */}
      <View style={styles.detectionModeContainer}>
        <TouchableOpacity
          style={[
            styles.detectionModeButton,
            detectionMode === 'tuning' && styles.detectionModeButtonActive,
            { 
              backgroundColor: detectionMode === 'tuning' ? colors.primary : colors.secondary,
              borderColor: colors.buttonBorder,
            }
          ]}
          onPress={() => setDetectionMode('tuning')}
        >
          <Text style={[
            styles.detectionModeText,
            { color: detectionMode === 'tuning' ? colors.textOnPrimary : colors.text }
          ]}>
            🎸 Tuning
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.detectionModeButton,
            detectionMode === 'intonation' && styles.detectionModeButtonActive,
            { 
              backgroundColor: detectionMode === 'intonation' ? colors.primary : colors.secondary,
              borderColor: colors.buttonBorder,
            }
          ]}
          onPress={() => setDetectionMode('intonation')}
        >
          <Text style={[
            styles.detectionModeText,
            { color: detectionMode === 'intonation' ? colors.textOnPrimary : colors.text }
          ]}>
            📏 Intonation
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tuning and Mode selectors - side by side */}
      <View style={styles.selectorsRow}>
        {/* Tuning selector */}
        <View style={styles.selectorColumn}>
          <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>TUNING</Text>
          <View style={styles.cycler}>
            <TouchableOpacity 
              style={styles.chevron}
              onPress={() => {
                const keys = Object.keys(TUNINGS);
                const currentIndex = keys.indexOf(selectedTuning);
                const prevIndex = (currentIndex - 1 + keys.length) % keys.length;
                setSelectedTuning(keys[prevIndex]);
              }}
            >
              <Text style={[styles.chevronText, { color: colors.primary }]}>‹</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.cyclerText}
              onPress={() => {
                const keys = Object.keys(TUNINGS);
                const currentIndex = keys.indexOf(selectedTuning);
                const nextIndex = (currentIndex + 1) % keys.length;
                setSelectedTuning(keys[nextIndex]);
              }}
            >
              <Text style={[styles.cyclerValue, { color: colors.text }]}>
                {(TUNINGS as any)[selectedTuning]?.name || ''}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.chevron}
              onPress={() => {
                const keys = Object.keys(TUNINGS);
                const currentIndex = keys.indexOf(selectedTuning);
                const nextIndex = (currentIndex + 1) % keys.length;
                setSelectedTuning(keys[nextIndex]);
              }}
            >
              <Text style={[styles.chevronText, { color: colors.primary }]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Mode selector - only show in tuning mode */}
        {detectionMode === 'tuning' && (
        <View style={styles.selectorColumn}>
          <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>MODE</Text>
          <View style={styles.cycler}>
            <TouchableOpacity 
              style={styles.chevron}
              onPress={() => {
                const newMode = mode === 'auto' ? 'manual' : 'auto';
                setMode(newMode);
                if (newMode === 'auto') {
                  setSelectedString(null);
                  setIsDetecting(false);
                }
              }}
            >
              <Text style={[styles.chevronText, { color: colors.primary }]}>‹</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.cyclerText}
              onPress={() => {
                const newMode = mode === 'auto' ? 'manual' : 'auto';
                setMode(newMode);
                if (newMode === 'auto') {
                  setSelectedString(null);
                  setIsDetecting(false);
                }
              }}
            >
              <Text style={[styles.cyclerValue, { color: colors.text }]}>
                {mode === 'auto' ? 'Auto' : 'Manual'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.chevron}
              onPress={() => {
                const newMode = mode === 'auto' ? 'manual' : 'auto';
                setMode(newMode);
                if (newMode === 'auto') {
                  setSelectedString(null);
                  setIsDetecting(false);
                }
              }}
            >
              <Text style={[styles.chevronText, { color: colors.primary }]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
        )}
      </View>

      {/* String selector */}
      <View style={styles.stringSelector}>
        <Text style={[styles.stringSelectorLabel, { color: colors.textSecondary }]}>
          {detectionMode === 'intonation' 
            ? 'Select string to check intonation:' 
            : 'Select string to tune:'}
        </Text>
        <View style={styles.stringButtons}>
          {((TUNINGS as any)[selectedTuning]?.strings || []).map((string: any) => {
            const isSelected = selectedString === string.stringNumber;
            // In auto mode: show color if this string is detected
            // In manual/intonation mode: show color if this string is selected AND detected
            const isBeingTuned = detectionData.stringNumber === string.stringNumber && detectionData.detectedString;
            const isDetectingInManual = (mode === 'manual' || detectionMode === 'intonation') && isSelected && isDetecting && !isBeingTuned;
            
            // Determine button color based on tuning status
            let buttonColor = colors.secondary; // default
            let borderColor = colors.buttonBorder; // default
            let textColor = colors.text;
            
            if (isBeingTuned) {
              const cents = detectionData.centsOff;
              if (Math.abs(cents) < 5) {
                // In tune
                buttonColor = colors.inTune;
                borderColor = colors.primary;
                textColor = colors.textOnPrimary;
              } else if (cents < 0) {
                // Flat
                buttonColor = colors.flat;
                borderColor = colors.flatBorder;
                textColor = colors.textOnPrimary;
              } else {
                // Sharp
                buttonColor = colors.sharp;
                borderColor = colors.sharpBorder;
                textColor = colors.textOnPrimary;
              }
            } else if (isDetectingInManual) {
              // Detecting but not close enough
              buttonColor = colors.flat;
              borderColor = colors.flatBorder;
            } else if (isSelected) {
              // Selected but not detecting yet
              borderColor = colors.primary;
            }
            
            return (
              <TouchableOpacity
                key={string.stringNumber}
                onPress={() => {
                  if (selectedString === string.stringNumber) {
                    // Clicking same string again = deselect (go to auto in tuning mode)
                    setSelectedString(null);
                    if (detectionMode === 'tuning') {
                      setMode('auto');
                    }
                    setIsDetecting(false);
                  } else {
                    // Clicking different string = select it
                    setSelectedString(string.stringNumber);
                    // In tuning mode, selecting a string switches to manual mode
                    if (detectionMode === 'tuning') {
                      setMode('manual');
                    }
                  }
                }}
              >
                <Animated.View
                  style={[
                    styles.stringButton,
                    { 
                      backgroundColor: buttonColor, 
                      borderColor: borderColor,
                      opacity: isDetectingInManual ? blinkAnim : 1
                    }
                  ]}
                >
                  <Text style={[styles.stringNumber, { color: colors.textSecondary }]}>
                    {string.stringNumber}
                  </Text>
                  <Text style={[styles.stringNote, { color: textColor }]}>
                    {string.name}
                  </Text>
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Main display area */}
      <View style={styles.mainContent}>
        <TuningBar
          centsOff={detectionData.centsOff}
          isActive={!!detectionData.frequency}
          noteName={detectionMode === 'intonation' && detectionData.actualNote
            ? detectionData.actualNote
            : detectionData.detectedString}
          colors={colors}
        />
        {/* Cents chip — right below the gauge */}
        {detectionData.frequency ? (() => {
          const cents = detectionData.centsOff;
          const absCents = Math.abs(cents);
          const centsColor = absCents <= 4  ? colors.inTune
                           : absCents <= 15 ? '#F5A623'
                           : '#E05252';
          const centsLabel = absCents <= 4  ? '✓  in tune'
                           : cents > 0      ? `+${cents} ¢`
                                            : `${cents} ¢`;
          return (
            <View style={{
              marginTop: 2,
              paddingHorizontal: 14, paddingVertical: 4,
              borderRadius: 20,
              borderWidth: 1, borderColor: centsColor,
              backgroundColor: centsColor + '22',
            }}>
              <Text style={{ color: centsColor, fontSize: 13, fontFamily: 'monospace', fontWeight: '700', letterSpacing: 0.5 }}>
                {centsLabel}
              </Text>
            </View>
          );
        })() : null}

      </View>

      {/* Frequency info panel */}
      <View style={styles.infoSection}>
        {detectionData.frequency ? (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 10, letterSpacing: 1, fontFamily: 'monospace', textTransform: 'uppercase' }}>Target</Text>
                <Text style={{ color: colors.text, fontSize: 14, fontFamily: 'monospace', fontWeight: '600' }}>
                  {detectionData.targetFrequency?.toFixed(2) ?? '—'} <Text style={{ fontSize: 11, color: colors.textSecondary }}>Hz</Text>
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: colors.buttonBorder, marginVertical: 2 }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 10, letterSpacing: 1, fontFamily: 'monospace', textTransform: 'uppercase' }}>Detected</Text>
                <Text style={{ color: colors.text, fontSize: 14, fontFamily: 'monospace', fontWeight: '600' }}>
                  {detectionData.frequency.toFixed(2)} <Text style={{ fontSize: 11, color: colors.textSecondary }}>Hz</Text>
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {/* Audio processing engine */}
      <FrequencyDetector
        onFrequencyDetected={handleFrequencyDetected}
        currentTuning={(TUNINGS as any)[selectedTuning]}
        isActive={isListening}
        mode={mode}
        detectionMode={detectionMode}
        selectedString={selectedString}
        onRawFrequency={setRawFrequency as any}
        onBufferStatus={setBufferStatus as any}
        onSignalLevel={() => {}}
        referencePitch={settings.referencePitch}
        yinThreshold={settings.yinThreshold}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  detectionModeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 10,
  },
  detectionModeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
  },
  detectionModeButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  detectionModeText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  selectorsRow: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingVertical: 10,
    gap: 10,
  },
  selectorColumn: {
    flex: 1,
  },
  selectorLabel: {
    fontSize: 10,
    marginBottom: 6,
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: 1,
  },
  cycler: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chevron: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chevronText: {
    fontSize: 28,
    fontWeight: '300',
  },
  cyclerText: {
    flex: 1,
    paddingVertical: 8,
  },
  cyclerValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  stringSelector: {
    paddingHorizontal: 20,
    paddingTop: 5,
    paddingBottom: 5,
  },
  stringSelectorLabel: {
    fontSize: 11,
    marginBottom: 6,
    textAlign: 'center',
    fontWeight: '600',
  },
  stringButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stringButton: {
    width: 50,
    height: 55,
    borderRadius: 8,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stringNumber: {
    fontSize: 10,
    fontWeight: '600',
  },
  stringNote: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  mainContent: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 8,
  },
  infoSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
});
