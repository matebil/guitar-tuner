import { calculateCents, findClosestString, getStatusColor, getStatusText, int16ToFloat32 } from '../audioUtils';

describe('audioUtils', () => {
  describe('calculateCents', () => {
    it('should return 0 cents for identical frequencies', () => {
      expect(calculateCents(440, 440)).toBe(0);
    });

    it('should return positive cents for sharp frequencies', () => {
      const cents = calculateCents(441, 440);
      expect(cents).toBeGreaterThan(0);
      expect(cents).toBeCloseTo(3.93, 1);
    });

    it('should return negative cents for flat frequencies', () => {
      const cents = calculateCents(439, 440);
      expect(cents).toBeLessThan(0);
      expect(cents).toBeCloseTo(-3.93, 1);
    });

    it('should handle null values', () => {
      expect(calculateCents(null, 440)).toBe(0);
      expect(calculateCents(440, null)).toBe(0);
    });

    it('should handle zero frequencies', () => {
      expect(calculateCents(0, 440)).toBe(0);
      expect(calculateCents(440, 0)).toBe(0);
    });

    it('should handle extreme frequency differences', () => {
      const cents = calculateCents(880, 440); // One octave up
      expect(cents).toBeCloseTo(1200, 0);
    });

    it('should handle very small frequency differences', () => {
      const cents = calculateCents(440.5, 440);
      expect(cents).toBeGreaterThan(0);
      expect(cents).toBeLessThan(2);
    });
  });

  describe('findClosestString', () => {
    const testTuning = {
      allPositions: [
        { name: 'E', note: 'E2', frequency: 82.41, stringNumber: 6, fret: 0 },
        { name: 'A', note: 'A2', frequency: 110.00, stringNumber: 5, fret: 0 },
        { name: 'D', note: 'D3', frequency: 146.83, stringNumber: 4, fret: 0 },
        { name: 'G', note: 'G3', frequency: 196.00, stringNumber: 3, fret: 0 },
        { name: 'B', note: 'B3', frequency: 246.94, stringNumber: 2, fret: 0 },
        { name: 'E', note: 'E4', frequency: 329.63, stringNumber: 1, fret: 0 },
      ]
    };

    it('should find exact frequency match', () => {
      const result = findClosestString(110.00, testTuning);
      expect(result.name).toBe('A');
      expect(result.stringNumber).toBe(5);
    });

    it('should find closest string within range', () => {
      const result = findClosestString(111, testTuning);
      expect(result.name).toBe('A');
    });

    it('should return null for out of range frequency', () => {
      const result = findClosestString(50, testTuning);
      expect(result).toBeNull();
    });

    it('should return null for invalid inputs', () => {
      expect(findClosestString(null, testTuning)).toBeNull();
      expect(findClosestString(110, null)).toBeNull();
    });

    it('should find the closest string when frequency is between two strings', () => {
      const result = findClosestString(115, testTuning); // Within range of A (110)
      expect(result).toBeDefined();
      expect(result.name).toBe('A');
    });

    it('should handle frequency slightly sharp', () => {
      const result = findClosestString(83, testTuning); // Slightly above low E (82.41)
      expect(result.name).toBe('E');
      expect(result.stringNumber).toBe(6);
    });

    it('should handle frequency slightly flat', () => {
      const result = findClosestString(109, testTuning); // Slightly below A (110)
      expect(result.name).toBe('A');
    });

    it('should return target frequency in the result', () => {
      const result = findClosestString(110, testTuning);
      expect(result.targetFrequency).toBe(110.00);
    });

    it('should handle very high frequencies', () => {
      const result = findClosestString(330, testTuning); // Near high E (329.63)
      expect(result.name).toBe('E');
      expect(result.stringNumber).toBe(1);
    });

    it('should handle tuning without strings', () => {
      const emptyTuning = { strings: [] };
      expect(findClosestString(110, emptyTuning)).toBeNull();
    });
  });

  describe('getStatusColor', () => {
    it('should return green for in-tune (< 5 cents)', () => {
      expect(getStatusColor(0)).toBe('#00ff00');
      expect(getStatusColor(4)).toBe('#00ff00');
      expect(getStatusColor(-4)).toBe('#00ff00');
    });

    it('should return yellow for close (5-15 cents)', () => {
      expect(getStatusColor(10)).toBe('#ffff00');
      expect(getStatusColor(-10)).toBe('#ffff00');
    });

    it('should return red for out of tune (> 15 cents)', () => {
      expect(getStatusColor(20)).toBe('#ff0000');
      expect(getStatusColor(-20)).toBe('#ff0000');
    });

    it('should handle boundary values', () => {
      expect(getStatusColor(5)).toBe('#ffff00');
      expect(getStatusColor(-5)).toBe('#ffff00');
      expect(getStatusColor(15)).toBe('#ff0000');
      expect(getStatusColor(-15)).toBe('#ff0000');
    });

    it('should handle extreme values', () => {
      expect(getStatusColor(100)).toBe('#ff0000');
      expect(getStatusColor(-100)).toBe('#ff0000');
    });
  });

  describe('getStatusText', () => {
    it('should return "IN TUNE ✓" for very close frequencies (< 3 cents)', () => {
      expect(getStatusText(0)).toBe('IN TUNE ✓');
      expect(getStatusText(2)).toBe('IN TUNE ✓');
      expect(getStatusText(-2)).toBe('IN TUNE ✓');
    });

    it('should return "X cents FLAT" for flat notes', () => {
      expect(getStatusText(-5)).toBe('5 cents FLAT');
      expect(getStatusText(-10)).toBe('10 cents FLAT');
      expect(getStatusText(-15.7)).toBe('16 cents FLAT');
    });

    it('should return "X cents SHARP" for sharp notes', () => {
      expect(getStatusText(5)).toBe('5 cents SHARP');
      expect(getStatusText(10)).toBe('10 cents SHARP');
      expect(getStatusText(15.3)).toBe('15 cents SHARP');
    });

    it('should round cents to nearest integer', () => {
      expect(getStatusText(7.4)).toBe('7 cents SHARP');
      expect(getStatusText(-7.6)).toBe('8 cents FLAT');
    });

    it('should handle boundary case at 3 cents', () => {
      expect(getStatusText(3)).toBe('3 cents SHARP');
      expect(getStatusText(-3)).toBe('3 cents FLAT');
    });
  });

  describe('int16ToFloat32', () => {
    it('should convert Int16Array to Float32Array', () => {
      const int16Samples = new Int16Array([0, 16384, -16384, 32767, -32768]);
      const float32Samples = int16ToFloat32(int16Samples);
      
      expect(float32Samples).toBeInstanceOf(Float32Array);
      expect(float32Samples.length).toBe(int16Samples.length);
    });

    it('should normalize values to range -1 to 1', () => {
      const int16Samples = new Int16Array([0, 16384, -16384, 32767, -32768]);
      const float32Samples = int16ToFloat32(int16Samples);
      
      expect(float32Samples[0]).toBeCloseTo(0, 5);
      expect(float32Samples[1]).toBeCloseTo(0.5, 5);
      expect(float32Samples[2]).toBeCloseTo(-0.5, 5);
      expect(float32Samples[3]).toBeCloseTo(0.999969, 5);
      expect(float32Samples[4]).toBeCloseTo(-1, 5);
    });

    it('should handle empty array', () => {
      const int16Samples = new Int16Array([]);
      const float32Samples = int16ToFloat32(int16Samples);
      
      expect(float32Samples.length).toBe(0);
    });

    it('should handle single sample', () => {
      const int16Samples = new Int16Array([16384]);
      const float32Samples = int16ToFloat32(int16Samples);
      
      expect(float32Samples.length).toBe(1);
      expect(float32Samples[0]).toBeCloseTo(0.5, 5);
    });

    it('should handle maximum positive value', () => {
      const int16Samples = new Int16Array([32767]);
      const float32Samples = int16ToFloat32(int16Samples);
      
      expect(float32Samples[0]).toBeLessThanOrEqual(1);
      expect(float32Samples[0]).toBeGreaterThan(0.99);
    });

    it('should handle maximum negative value', () => {
      const int16Samples = new Int16Array([-32768]);
      const float32Samples = int16ToFloat32(int16Samples);
      
      expect(float32Samples[0]).toBe(-1);
    });
  });
});
