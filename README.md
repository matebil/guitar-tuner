# Guitar Tuner, Intonation & Practice by Matebil

Matebil is a guitar training app built with React Native + Expo.

It is not only a tuner: it combines tuning, intonation checking, scale practice, guided exercises, quizzes, and a metronome in one workflow.

## What The App Does

### 1) Tuner Tab

- Real-time pitch detection from the microphone.
- Chromatic detection with cents offset feedback.
- Two detection modes:
- `Tuning` mode for regular tuning use.
- `Intonation` mode for setup checks across frets.
- Auto and manual string workflows.
- Multiple tuning presets (standard, alternate tunings, etc.).
- In-tune success haptics.

### 2) Practice Tab (Scales & Modes)

- Interactive fretboard practice for modes and pentatonics.
- 3-notes-per-string visualization.
- Real-time note detection while you play.
- Practice modes persisted locally (`practice`, `guide`, `quiz`).
- Guided sequence mode (ascending/descending note flow).
- Quiz modes including fretboard note challenges and guitar-based challenges.
- Difficulty progression for fretboard quiz.

### 3) Metronome Tab

- Tempo range from `40` to `240` BPM.
- Quick tempo presets for common practice tempos.
- Time signatures (`3/4`, `4/4`, `5/4`, `6/4`).
- Accent on beat 1.
- Stable timing loop designed to reduce drift.

### 4) Settings Tab

- Reference pitch selection (`432`, `440`, `443` Hz).
- Detection sensitivity controls.
- Theme selection.
- Settings persisted locally.

## Why It Is Useful For Practice

- Tune accurately before practice.
- Check intonation for better fretboard consistency.
- Practice scales and modes with visual + audio feedback.
- Train note recognition with quiz workflows.
- Keep timing tight with integrated metronome.

## Tech Stack

- [Expo](https://expo.dev) `55`
- React Native `0.83`
- `expo-router` for tab navigation
- `expo-audio` for playback/recording mode management
- `@siteed/expo-audio-studio` for audio stream capture
- `pitchfinder` (YIN) for pitch detection
- `expo-haptics` for in-tune tactile feedback
- `@react-native-async-storage/async-storage` for local persistence

## Project Structure (High Level)

- `app/(tabs)/index.tsx`: tuner + intonation screen
- `app/(tabs)/scales.tsx`: practice, guide, quiz flows
- `app/(tabs)/metronome.tsx`: metronome engine and UI
- `app/(tabs)/settings.tsx`: user settings
- `src/components/FrequencyDetector.js`: audio stream + pitch detection pipeline
- `src/contexts/SettingsContext.tsx`: persisted app configuration

## Getting Started

```bash
npm install
npm run prebuild:clean
npx expo run:ios
npx expo run:android
```

## Build Notes

### iOS (App Store)

```bash
npm run prebuild:clean
# Open ios/GuitarTunerIntonation.xcworkspace in Xcode
# Product > Archive > Distribute App > App Store Connect
```

### Android

```bash
npm run prebuild:clean
npx expo run:android --variant release
```

## Requirements

- Node.js `18+`
- npm `9+`
- Xcode `16+` (iOS)
- CocoaPods (iOS)
- Android Studio + SDK (Android)

## License

MIT
