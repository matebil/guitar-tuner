# Metronome Sounds

This directory contains sound files for the metronome feature.

## Sound Files

- **tick.mp3** - Regular beat sound (800Hz, 50ms)
- **tock.mp3** - Accent beat sound (1200Hz, 50ms) - plays on first beat of measure

## Generating Sounds with ffmpeg

If you have ffmpeg installed, you can generate these sounds:

```bash
# Navigate to this directory
cd assets/sounds/metronome

# Generate tick sound (regular beats)
ffmpeg -f lavfi -i "sine=frequency=800:duration=0.05" -af "volume=1.0" tick.mp3

# Generate tock sound (accent beat - higher pitch)
ffmpeg -f lavfi -i "sine=frequency=1200:duration=0.05" -af "volume=1.0" tock.mp3
```

## Installing ffmpeg (macOS)

```bash
brew install ffmpeg
```

## Alternative: Download Pre-made Sounds

If you prefer not to use ffmpeg, you can:
1. Download free metronome click sounds from freesound.org
2. Or use any short click/beep sounds you prefer
3. Name them `tick.mp3` and `tock.mp3` and place them in this directory
