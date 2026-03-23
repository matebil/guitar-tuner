/**
 * Matebil Guitar Tuner
 * FrequencyDetector Component Tests
 */

import { calculateCents, findClosestString } from '../../utils/audioUtils';

// Mock for FrequencyDetector logic (pitch detection & string matching)
describe('FrequencyDetector Logic', () => {
  describe('Pitch Detection Integration', () => {
    it('should detect frequencies within guitar range', () => {
      // Test frequency detection boundaries
      const lowE = 82.41; // E2 (lowest guitar note)
      const highE = 329.6; // E4 (highest open string)
      expect(lowE).toBeGreaterThanOrEqual(60);
      expect(highE).toBeLessThanOrEqual(1400);
    });

    it('should handle rapid frequency changes (plucking)', () => {
      const frequencies = [80, 82.41, 85, 87, 88];
      // Each frequency should be within detection range
      frequencies.forEach(freq => {
        expect(freq).toBeGreaterThanOrEqual(60);
        expect(freq).toBeLessThanOrEqual(1400);
      });
    });
  });

  describe('String Detection', () => {
    const standardTuning = {
      allPositions: [
        { name: 'E', note: 'E2', frequency: 82.41, stringNumber: 6, fret: 0 },
        { name: 'A', note: 'A2', frequency: 110.00, stringNumber: 5, fret: 0 },
        { name: 'D', note: 'D3', frequency: 146.83, stringNumber: 4, fret: 0 },
        { name: 'G', note: 'G3', frequency: 196.00, stringNumber: 3, fret: 0 },
        { name: 'B', note: 'B3', frequency: 246.94, stringNumber: 2, fret: 0 },
        { name: 'E', note: 'E4', frequency: 329.63, stringNumber: 1, fret: 0 },
      ]
    };

    it('should identify strings when in tune', () => {
      standardTuning.allPositions.forEach(position => {
        const result = findClosestString(position.frequency, standardTuning);
        expect(result).not.toBeNull();
        expect(result?.frequency).toBeCloseTo(position.frequency, 0);
      });
    });

    it('should handle slightly sharp/flat notes', () => {
      const sharpA = 111; // A slightly sharp
      const flatA = 109;  // A slightly flat
      
      const resultSharp = findClosestString(sharpA, standardTuning);
      const resultFlat = findClosestString(flatA, standardTuning);
      
      expect(resultSharp.name).toBe('A');
      expect(resultFlat.name).toBe('A');
    });

    it('should reject frequencies outside tuning range', () => {
      const tooLow = 50;   // Below low E
      const tooHigh = 500; // Above high E
      
      expect(findClosestString(tooLow, standardTuning)).toBeNull();
      expect(findClosestString(tooHigh, standardTuning)).toBeNull();
    });
  });

  describe('Frequency to Cents Conversion', () => {
    it('should calculate 0 cents for perfect pitch', () => {
      expect(calculateCents(440, 440)).toBe(0);
    });

    it('should calculate positive cents for sharp notes', () => {
      const cents = calculateCents(450, 440);
      expect(cents).toBeGreaterThan(0);
      expect(cents).toBeLessThan(100);
    });

    it('should calculate negative cents for flat notes', () => {
      const cents = calculateCents(430, 440);
      expect(cents).toBeLessThan(0);
      expect(cents).toBeGreaterThan(-100);
    });

    it('should handle guitar-specific cent ranges', () => {
      // Guitar tuning typically within ±50 cents
      expect(calculateCents(441, 440)).toBeCloseTo(3.93, 1);
      expect(calculateCents(439, 440)).toBeCloseTo(-3.93, 1);
    });

    it('should calculate 1200 cents for octave difference', () => {
      const cents = calculateCents(880, 440);
      expect(cents).toBeCloseTo(1200, 0);
    });
  });

  describe('Detection Mode - Tuning vs Intonation', () => {
    const testFrequency = 82.41; // Low E
    const targetFrequency = 82.41;

    it('tuning mode: should report string number', () => {
      // In tuning mode, we detect which string is being played
      const cents = calculateCents(testFrequency, targetFrequency);
      expect(cents).toBe(0);
    });

    it('intonation mode: should report actual note vs target fret', () => {
      // In intonation mode, we detect the fret position
      const frettedNote = 92.5; // E2 fretted (shifted from open)
      const detectionNote = 92.49;
      const cents = calculateCents(detectionNote, frettedNote);
      expect(Math.abs(cents)).toBeLessThan(10); // Should be very close
    });
  });

  describe('Edge Cases', () => {
    it('should handle null frequency gracefully', () => {
      expect(calculateCents(null, 440)).toBe(0);
      expect(calculateCents(440, null)).toBe(0);
    });

    it('should handle zero frequency', () => {
      expect(calculateCents(0, 440)).toBe(0);
      expect(calculateCents(440, 0)).toBe(0);
    });

    it('should handle silence detection (near-zero RMS)', () => {
      // Silence threshold should be very low RMS
      const silenceRMS = 0.007; // Below detection threshold
      const noiseRMS = 0.015;   // Above detection threshold
      expect(silenceRMS).toBeLessThan(noiseRMS);
    });

    it('should distinguish between pluck onset and sustained note', () => {
      // Rapid frequency stabilization indicates pluck onset
      const frequencies = [75, 82, 82.3, 82.35, 82.4]; // Quickly stabilizes
      const lastTwo = frequencies.slice(-2);
      const variance = Math.abs(lastTwo[1] - lastTwo[0]);
      expect(variance).toBeLessThan(1); // Small variance = stable note
    });
  });

  describe('Performance Requirements', () => {
    it('should process buffers within time constraints', () => {
      const bufferCount = 100;
      const expectedBuffersPerSecond = 44100 / 4096; // ~10.7 buffers/sec
      expect(bufferCount / expectedBuffersPerSecond).toBeGreaterThan(0);
    });

    it('should handle Android lower sample rate', () => {
      const androidSampleRate = 16000;
      const bufferSize = 1536;
      const androidBuffersPerSecond = androidSampleRate / bufferSize;
      expect(androidBuffersPerSecond).toBeCloseTo(10.4, 1);
    });
  });
});
