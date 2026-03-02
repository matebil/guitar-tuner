# Guitar Tuner & Intonation by Matebil

A chromatic guitar tuner and metronome app built with React Native + Expo.

## Features

- **Chromatic tuner** — real-time pitch detection via microphone
- **Metronome** — adjustable BPM with haptic feedback
- **Dark/light mode** — follows system preference
- **Multiple tunings** — standard, drop D, open G, and more

## Tech Stack

- [Expo](https://expo.dev) 55 / React Native 0.83
- [`expo-audio`](https://docs.expo.dev/versions/latest/sdk/audio/) for metronome playback
- [`expo-haptics`](https://docs.expo.dev/versions/latest/sdk/haptics/) for in-tune feedback
- [`expo-av`](https://docs.expo.dev/versions/latest/sdk/av/) (microphone / pitch detection)

## Getting Started

```bash
npm install
npm run prebuild:clean   # generates iOS/Android native projects
npx expo run:ios         # run on iOS device/simulator
npx expo run:android     # run on Android
```

## Building for App Store

```bash
npm run prebuild:clean
# Open ios/matebiltuner.xcworkspace in Xcode
# Product → Archive → Distribute App → App Store Connect
```

## Requirements

- Node 18+
- Xcode 16+
- CocoaPods

## License

MIT
