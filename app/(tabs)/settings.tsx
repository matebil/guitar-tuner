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
});
