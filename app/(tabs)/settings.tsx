import { useSettings } from '@/src/contexts/SettingsContext';
import { csvEscape } from '@/src/utils/fretboard-practice';
import {
  loadPracticePersistedState,
  savePracticeFretboardAttemptLog,
  savePracticeFretboardPositionStats,
} from '@/src/utils/practice-storage';
import * as FileSystem from 'expo-file-system/legacy';
import React from 'react';
import { Alert, Linking, ScrollView, Share, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const { settings, updateReferencePitch, updateYinThreshold, updateTheme, getThemeColors } = useSettings();
  const colors = getThemeColors();
  const [expandedSections, setExpandedSections] = React.useState({
    referencePitch: true,
    detectionSensitivity: false,
    theme: false,
    practiceData: false,
    userManual: false,
  });

  const themeOptions = [
    { value: 'dark' as const, label: '🌙 Night' },
    { value: 'light' as const, label: '☀️ Day' },
  ];

  const pitchOptions = [
    { value: 432, label: '432 Hz (Verdi\'s A)' },
    { value: 440, label: '440 Hz (Standard)' },
    { value: 443, label: '443 Hz (Historical)' },
  ];

  const thresholdOptions = [
    { value: 0.1, label: 'High' },
    { value: 0.15, label: 'Medium (Recommended)' },
    { value: 0.2, label: 'Low' },
  ];


  const openGitHub = () => {
    Linking.openURL('https://github.com/matebil/guitar-tuner');
  };

  const openMatebil = () => {
    Linking.openURL('https://matebil.com');
  };

  const exportFretboardAttemptsCsv = async () => {
    const state = await loadPracticePersistedState();
    const rows = Array.isArray(state.fretboardAttemptLog) ? state.fretboardAttemptLog : [];
    if (rows.length === 0) {
      Alert.alert('No data', 'There are no fretboard attempts to export yet.');
      return;
    }

    const header = ['timestamp_iso', 'mode', 'string', 'fret', 'note', 'time_ms', 'correct', 'mastered'];
    const csvRows = rows.map((row: any) => [
      new Date(Number(row?.timestamp ?? Date.now())).toISOString(),
      row?.mode ?? '',
      row?.stringNumber ?? '',
      row?.fret ?? '',
      row?.note ?? '',
      row?.responseMs ?? '',
      Boolean(row?.correct),
      Boolean(row?.mastered),
    ]);

    const csv = [header, ...csvRows]
      .map((cols) => cols.map((col) => csvEscape(col)).join(','))
      .join('\n');

    const fileUri = `${FileSystem.cacheDirectory}matebil-fretboard-attempts-${Date.now()}.csv`;
    await (FileSystem as any).writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });

    await Share.share({
      url: fileUri,
      message: 'Matebil fretboard attempts CSV',
      title: 'Export fretboard attempts',
    });
  };

  const resetMemorizedPositions = async () => {
    const state = await loadPracticePersistedState();
    const source = state.fretboardPositionStats ?? {};
    const next: Record<string, { attempts: number; totalMs: number; mastered: boolean }> = {};
    for (const [key, stats] of Object.entries(source)) {
      next[key] = { ...stats, mastered: false };
    }
    await savePracticeFretboardPositionStats(next);
    Alert.alert('Done', 'Memorized fretboard positions were reset.');
  };

  const clearFretboardAttemptLog = async () => {
    await savePracticeFretboardAttemptLog([]);
    Alert.alert('Done', 'Fretboard attempt log cleared.');
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={settings.theme === 'light' ? 'dark-content' : 'light-content'} />
      <ScrollView style={styles.scrollView}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primary }]}>Settings</Text>
        </View>

        {/* Reference Pitch Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.accordionHeader, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}
            onPress={() => toggleSection('referencePitch')}
          >
            <Text style={[styles.sectionTitle, styles.accordionTitle, { color: colors.primary }]}>Reference Pitch</Text>
            <Text style={[styles.accordionIcon, { color: colors.primary }]}>{expandedSections.referencePitch ? '−' : '+'}</Text>
          </TouchableOpacity>
          {expandedSections.referencePitch && (
            <View style={[styles.accordionBody, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}> 
              <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}> 
                Standard tuning reference frequency. Different orchestras and periods used different reference pitches.
              </Text>
              <View style={styles.optionsContainer}>
                {pitchOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      { backgroundColor: colors.buttonBg, borderColor: colors.buttonBorder },
                      settings.referencePitch === option.value && { backgroundColor: colors.primary, borderColor: colors.primary }
                    ]}
                    onPress={() => updateReferencePitch(option.value)}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      { color: settings.referencePitch === option.value ? colors.textOnPrimary : colors.textSecondary },
                      settings.referencePitch === option.value && styles.optionButtonTextActive
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Sensitivity Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.accordionHeader, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}
            onPress={() => toggleSection('detectionSensitivity')}
          >
            <Text style={[styles.sectionTitle, styles.accordionTitle, { color: colors.primary }]}>Detection Sensitivity</Text>
            <Text style={[styles.accordionIcon, { color: colors.primary }]}>{expandedSections.detectionSensitivity ? '−' : '+'}</Text>
          </TouchableOpacity>
          {expandedSections.detectionSensitivity && (
            <View style={[styles.accordionBody, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}> 
              <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}> 
                Adjust how quickly the tuner responds. Higher sensitivity may pick up background noise.
              </Text>
              <View style={styles.optionsContainer}>
                {thresholdOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      { backgroundColor: colors.buttonBg, borderColor: colors.buttonBorder },
                      settings.yinThreshold === option.value && { backgroundColor: colors.primary, borderColor: colors.primary }
                    ]}
                    onPress={() => updateYinThreshold(option.value)}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      { color: settings.yinThreshold === option.value ? colors.textOnPrimary : colors.textSecondary },
                      settings.yinThreshold === option.value && styles.optionButtonTextActive
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Theme Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.accordionHeader, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}
            onPress={() => toggleSection('theme')}
          >
            <Text style={[styles.sectionTitle, styles.accordionTitle, { color: colors.primary }]}>Theme</Text>
            <Text style={[styles.accordionIcon, { color: colors.primary }]}>{expandedSections.theme ? '−' : '+'}</Text>
          </TouchableOpacity>
          {expandedSections.theme && (
            <View style={[styles.accordionBody, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}> 
              <View style={styles.optionsContainer}>
                {themeOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      { backgroundColor: colors.buttonBg, borderColor: colors.buttonBorder },
                      settings.theme === option.value && { backgroundColor: colors.primary, borderColor: colors.primary }
                    ]}
                    onPress={() => updateTheme(option.value)}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      { color: settings.theme === option.value ? colors.textOnPrimary : colors.textSecondary },
                      settings.theme === option.value && styles.optionButtonTextActive
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Practice Data Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.accordionHeader, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}
            onPress={() => toggleSection('practiceData')}
          >
            <Text style={[styles.sectionTitle, styles.accordionTitle, { color: colors.primary }]}>Practice Data</Text>
            <Text style={[styles.accordionIcon, { color: colors.primary }]}>{expandedSections.practiceData ? '−' : '+'}</Text>
          </TouchableOpacity>
          {expandedSections.practiceData && (
            <View style={[styles.accordionBody, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}> 
              <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>Manage your fretboard quiz data from here.</Text>

              <TouchableOpacity
                style={[styles.optionButton, { backgroundColor: colors.buttonBg, borderColor: colors.buttonBorder }]}
                onPress={() => {
                  void exportFretboardAttemptsCsv().catch(() => {
                    Alert.alert('Export error', 'Unable to export CSV right now.');
                  });
                }}
              >
                <Text style={[styles.optionButtonText, { color: colors.textSecondary, fontWeight: '700' }]}>Export fretboard attempts CSV</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.optionButton, { backgroundColor: colors.buttonBg, borderColor: colors.buttonBorder, marginTop: 10 }]}
                onPress={() => {
                  Alert.alert(
                    'Reset memorized positions',
                    'This will make all positions eligible again in random quiz. Continue?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Reset', style: 'destructive', onPress: () => { void resetMemorizedPositions().catch(() => {}); } },
                    ]
                  );
                }}
              >
                <Text style={[styles.optionButtonText, { color: colors.sharp, fontWeight: '700' }]}>Reset memorized positions</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.optionButton, { backgroundColor: colors.buttonBg, borderColor: colors.buttonBorder, marginTop: 10 }]}
                onPress={() => {
                  Alert.alert(
                    'Clear attempt log',
                    'Delete all fretboard attempt history? This cannot be undone.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => { void clearFretboardAttemptLog().catch(() => {}); } },
                    ]
                  );
                }}
              >
                <Text style={[styles.optionButtonText, { color: colors.sharp, fontWeight: '700' }]}>Clear fretboard attempt log</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* User Manual Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.accordionHeader, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}
            onPress={() => toggleSection('userManual')}
          >
            <Text style={[styles.sectionTitle, styles.accordionTitle, { color: colors.primary }]}>User Manual</Text>
            <Text style={[styles.accordionIcon, { color: colors.primary }]}>{expandedSections.userManual ? '−' : '+'}</Text>
          </TouchableOpacity>

          {expandedSections.userManual && (
            <View style={styles.accordionManualWrap}>
              {/* Tuner */}
              <View style={[styles.manualCard, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}> 
                <Text style={[styles.manualTabTitle, { color: colors.primary }]}>🎸  Tuner</Text>
                <Text style={[styles.manualDesc, { color: colors.text }]}> 
                  Real-time pitch detection from the microphone. Switch between{' '}
                  <Text style={{ fontWeight: '700' }}>Tuning</Text> mode for regular string tuning and{' '}
                  <Text style={{ fontWeight: '700' }}>Intonation</Text> mode to check fret-by-fret accuracy during guitar setup.
                </Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Chromatic detection with cents offset display</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Multiple tuning presets (Standard, Drop D, Open G, DADGAD…)</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Auto and manual string selection</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Haptic feedback when in tune</Text>
              </View>

              {/* Scales & Modes */}
              <View style={[styles.manualCard, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}> 
                <Text style={[styles.manualTabTitle, { color: colors.primary }]}>🎼  Scales & Modes</Text>
                <Text style={[styles.manualDesc, { color: colors.text }]}> 
                  Three practice modes for modes, pentatonics and fretboard knowledge. Pick root + mode at the top — everything below updates in real time.
                </Text>

                <Text style={[styles.manualSubtitle, { color: colors.text }]}>Practice</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• 3-notes-per-string fretboard diagram for any mode</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Pentatonic view with diatonic chord + pentatonic fretboard</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Live note detection — dots light up as you play</Text>

                <Text style={[styles.manualSubtitle, { color: colors.text }]}>Guide</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Plays you through the scale one note at a time (ascending or descending)</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Works for modes AND pentatonics (Major / Minor toggle)</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• String + fret hint shown for every note</Text>

                <Text style={[styles.manualSubtitle, { color: colors.text }]}>Quiz</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Fretboard quiz: identify a note shown on the neck (Easy / Medium / Hard)</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Guitar quiz: play the asked scale degree on your guitar — mic evaluates it</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• By-fret quiz: choose Easy / Medium / Hard, tap Start, wait for the 3-second countdown, then answer by tapping one of the 6 note buttons</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Mastery tracking: positions answered in {'<'}2 s are marked memorised and excluded</Text>
              </View>

              {/* Metronome */}
              <View style={[styles.manualCard, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}> 
                <Text style={[styles.manualTabTitle, { color: colors.primary }]}>🥁  Metronome</Text>
                <Text style={[styles.manualDesc, { color: colors.text }]}> 
                  Steady click with visual beat indicator. Tap the BPM display to enter a tempo directly, or use the +/− buttons.
                </Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• 40–240 BPM range</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Quick presets: Slow / Medium / Fast / Very fast</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Time signatures: 3/4, 4/4, 5/4, 6/4</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Beat 1 accented for easier counting</Text>
              </View>

              {/* Settings */}
              <View style={[styles.manualCard, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}> 
                <Text style={[styles.manualTabTitle, { color: colors.primary }]}>⚙️  Settings (here)</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Reference pitch: 432 Hz, 440 Hz (standard), 443 Hz</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Detection sensitivity: adjust to filter background noise</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Theme: Night (dark) or Day (light)</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Practice Data: export CSV and reset memorized fretboard positions</Text>
                <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• All settings saved automatically</Text>
              </View>
            </View>
          )}
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>About</Text>
          <View style={[styles.aboutContent, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}>
            <Text style={[styles.aboutText, { color: colors.primary }]}>
              Guitar Tuner & Metronome
            </Text>
            <Text style={[styles.aboutVersion, { color: colors.textSecondary }]}>Version 1.0.7</Text>
            <Text style={[styles.aboutDescription, { color: colors.text }]}>
              Open source guitar tuner, intonation tool, scale practice and metronome.
            </Text>

            <TouchableOpacity style={[styles.linkButton, { borderColor: colors.primary }]} onPress={openGitHub}>
              <Text style={[styles.linkButtonText, { color: colors.primary }]}>📦 View source on GitHub</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.linkButton, { borderColor: colors.primary, marginTop: 10 }]} onPress={openMatebil}>
              <Text style={[styles.linkButtonText, { color: colors.primary }]}>Made by Matebil Limited</Text>
            </TouchableOpacity>

            <Text style={[styles.credits, { color: colors.textSecondary }]}>
              © 2026 Matebil Limited
            </Text>
          </View>
        </View>

        {/* Bottom Spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  section: {
    marginHorizontal: 20,
    marginTop: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  accordionHeader: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accordionTitle: {
    marginBottom: 0,
  },
  accordionIcon: {
    fontSize: 24,
    fontWeight: '300',
    lineHeight: 24,
  },
  accordionBody: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
  },
  accordionManualWrap: {
    marginTop: 10,
  },
  optionsContainer: {
    gap: 10,
  },
  optionButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  optionButtonText: {
    fontSize: 14,
  },
  optionButtonTextActive: {
    fontWeight: 'bold',
  },
  aboutContent: {
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
  },
  aboutText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  aboutVersion: {
    fontSize: 13,
    marginBottom: 15,
  },
  aboutDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 15,
  },
  linkButton: {
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 15,
    alignItems: 'center',
  },
  linkButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  credits: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  manualCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  manualTabTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  manualSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  manualDesc: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
  },
  manualBullet: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 2,
  },
});
