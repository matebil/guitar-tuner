import { useSettings } from '@/src/contexts/SettingsContext';
import React from 'react';
import { Linking, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const { settings, updateReferencePitch, updateYinThreshold, updateTheme, getThemeColors } = useSettings();
  const colors = getThemeColors();

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
    { value: 0.10, label: 'High' },
    { value: 0.15, label: 'Medium (Recommended)' },
    { value: 0.20, label: 'Low' },
  ];


  const openGitHub = () => {
    Linking.openURL('https://github.com/matebil/guitar-tuner');
  };

  const openMatebil = () => {
    Linking.openURL('https://matebil.com');
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
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Reference Pitch</Text>
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

        {/* Sensitivity Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Detection Sensitivity</Text>
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

        {/* Theme Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Theme</Text>
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

        {/* User Manual Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>User Manual</Text>

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
            <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• By-fret drill: all 6 strings shown for a fret — builds positional awareness</Text>
            <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Mastery tracking: positions answered in {'<'}2 s are marked memorised and excluded</Text>
            <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• Export attempt log as CSV for your own analysis</Text>
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
            <Text style={[styles.manualBullet, { color: colors.textSecondary }]}>• All settings saved automatically</Text>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>About</Text>
          <View style={[styles.aboutContent, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}>
            <Text style={[styles.aboutText, { color: colors.primary }]}>
              Guitar Tuner & Metronome
            </Text>
            <Text style={[styles.aboutVersion, { color: colors.textSecondary }]}>Version 1.0.0</Text>
            <Text style={[styles.aboutDescription, { color: colors.text }]}>
              Open source guitar tuner, intonation tool and metronome.
            </Text>

            <View style={styles.featuresContainer}>
              <Text style={[styles.featureItem, { color: colors.textSecondary }]}>• Guitar tuner with multiple tuning presets</Text>
              <Text style={[styles.featureItem, { color: colors.textSecondary }]}>• Intonation tool for fret-by-fret setup</Text>
              <Text style={[styles.featureItem, { color: colors.textSecondary }]}>• Precision metronome with time signatures</Text>
            </View>

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
  featuresContainer: {
    marginBottom: 20,
  },
  featureItem: {
    fontSize: 14,
    marginBottom: 5,
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
