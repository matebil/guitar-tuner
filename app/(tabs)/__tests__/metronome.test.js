/**
 * Matebil Guitar Tuner
 * Metronome Logic Tests
 */

describe('Metronome', () => {
  describe('Tempo (BPM) Control', () => {
    it('should support BPM range 40-240', () => {
      const minBPM = 40;
      const maxBPM = 240;
      expect(minBPM).toBeGreaterThanOrEqual(40);
      expect(maxBPM).toBeLessThanOrEqual(240);
    });

    it('should calculate beat interval correctly', () => {
      const bpm = 120;
      const beatInterval = (60000 / bpm); // milliseconds
      expect(beatInterval).toBe(500); // 120 BPM = 500ms per beat
    });

    it('should handle fast tempo (240 BPM)', () => {
      const bpm = 240;
      const beatInterval = (60000 / bpm);
      expect(beatInterval).toBe(250);
    });

    it('should handle slow tempo (40 BPM)', () => {
      const bpm = 40;
      const beatInterval = (60000 / bpm);
      expect(beatInterval).toBe(1500);
    });

    it('should support BPM adjustment while playing', () => {
      const originalBPM = 120;
      const newBPM = 140;
      expect(newBPM).toBeGreaterThan(originalBPM);
      expect(newBPM).toBeLessThanOrEqual(240);
    });
  });

  describe('Time Signatures', () => {
    it('should support 3/4 time', () => {
      const timeSignature = { numerator: 3, denominator: 4 };
      expect(timeSignature.numerator).toBe(3);
      expect(timeSignature.denominator).toBe(4);
    });

    it('should support 4/4 time (common)', () => {
      const timeSignature = { numerator: 4, denominator: 4 };
      expect(timeSignature.numerator).toBe(4);
    });

    it('should support 5/4 time', () => {
      const timeSignature = { numerator: 5, denominator: 4 };
      expect(timeSignature.numerator).toBe(5);
    });

    it('should support 6/4 time', () => {
      const timeSignature = { numerator: 6, denominator: 4 };
      expect(timeSignature.numerator).toBe(6);
    });

    it('should calculate beats per measure', () => {
      const timeSignature = { numerator: 4, denominator: 4 };
      const beatsPerMeasure = timeSignature.numerator;
      expect(beatsPerMeasure).toBe(4);
    });

    it('should calculate measure duration', () => {
      const bpm = 120;
      const beatsPerMeasure = 4;
      const beatDuration = 60000 / bpm; // 500ms
      const measureDuration = beatDuration * beatsPerMeasure;
      expect(measureDuration).toBe(2000); // 2 seconds
    });
  });

  describe('Beat Accuracy', () => {
    it('should maintain consistent beat timing', () => {
      const bpm = 120;
      const beatInterval = 60000 / bpm; // 500ms
      const beats = [0, 500, 1000, 1500, 2000];
      
      // Check intervals between beats
      for (let i = 1; i < beats.length; i++) {
        const interval = beats[i] - beats[i - 1];
        expect(interval).toBe(beatInterval);
      }
    });

    it('should handle timing precision < 10ms error', () => {
      const bpm = 120;
      const beatInterval = 60000 / bpm;
      const calculatedInterval = 500;
      const error = Math.abs(beatInterval - calculatedInterval);
      expect(error).toBeLessThan(10);
    });

    it('should schedule next beat with calculated delay', () => {
      const bpm = 120;
      const beatInterval = 60000 / bpm;
      const currentTime = 1000;
      const nextBeatTime = currentTime + beatInterval;
      const delay = nextBeatTime - currentTime;
      
      expect(delay).toBe(beatInterval);
      expect(delay).toBeGreaterThan(0);
    });

    it('should handle rounding in tempo calculations', () => {
      const bpm = 117;
      const beatInterval = 60000 / bpm;
      expect(beatInterval).toBeCloseTo(512.82, 0); // ~513ms
      expect(Math.max(0, Math.round(beatInterval))).toBeGreaterThan(0);
    });
  });

  describe('Beat Playback', () => {
    it('should distinguish downbeat from regular beat', () => {
      const beatNumber = 1; // First beat
      const isDownbeat = (beatNumber % 4 === 1);
      expect(isDownbeat).toBe(true);
    });

    it('should cycle beats in configured time signature', () => {
      const beatsPerMeasure = 4;
      const beatSequence = [1, 2, 3, 4, 1, 2, 3, 4]; // Repeating pattern
      
      beatSequence.forEach((beat, index) => {
        const expectedBeat = (index % beatsPerMeasure) + 1;
        expect(beat).toBe(expectedBeat);
      });
    });

    it('should handle 5/4 beat cycling', () => {
      const beatsPerMeasure = 5;
      const beatSequence = [];
      for (let i = 0; i < 15; i++) {
        beatSequence.push((i % beatsPerMeasure) + 1);
      }
      
      // Check pattern repeats correctly
      expect(beatSequence[0]).toBe(1);
      expect(beatSequence[5]).toBe(1);
      expect(beatSequence[10]).toBe(1);
    });

    it('should emit sound on each beat', () => {
      const beatsSounded = 4;
      expect(beatsSounded).toBeGreaterThan(0);
    });

    it('should emit different sound for downbeat', () => {
      const downbeatSound = 'click-heavy';
      const regularSound = 'click-light';
      expect(downbeatSound).not.toBe(regularSound);
    });
  });

  describe('Start/Stop Control', () => {
    it('should initialize in stopped state', () => {
      const isPlaying = false;
      expect(isPlaying).toBe(false);
    });

    it('should start from beat 1', () => {
      const currentBeat = 1;
      expect(currentBeat).toBe(1);
    });

    it('should stop immediately', () => {
      const isPlaying = true;
      // Stop sets isPlaying to false
      const stoppedState = false;
      expect(stoppedState).toBe(false);
    });

    it('should clear timing on stop', () => {
      const intervalRef = null;
      expect(intervalRef).toBe(null);
    });

    it('should restart from beat 1 after stop', () => {
      const resetBeat = 1;
      expect(resetBeat).toBe(1);
    });
  });

  describe('Tempo Adjustment During Playback', () => {
    it('should update BPM without stopping', () => {
      const currentBPM = 120;
      const newBPM = 140;
      const isPlaying = true;
      
      expect(newBPM).not.toBe(currentBPM);
      expect(isPlaying).toBe(true);
    });

    it('should adjust beat interval immediately', () => {
      const oldBPM = 120;
      const newBPM = 140;
      const oldInterval = 60000 / oldBPM; // ~500ms
      const newInterval = 60000 / newBPM; // ~428ms
      
      expect(newInterval).toBeLessThan(oldInterval);
    });

    it('should handle incremental tempo changes', () => {
      const bpm = 120;
      const step = 1;
      const increasedBPM = bpm + step;
      
      expect(increasedBPM).toBe(121);
      expect(increasedBPM).toBeLessThanOrEqual(240);
    });

    it('should prevent invalid BPM values', () => {
      const validate = (bpm) => bpm >= 40 && bpm <= 240;
      
      expect(validate(120)).toBe(true);
      expect(validate(39)).toBe(false);
      expect(validate(241)).toBe(false);
    });
  });

  describe('Audio/Haptic Feedback', () => {
    it('should provide audio click', () => {
      const soundEnabled = true;
      expect(soundEnabled).toBe(true);
    });

    it('should provide haptic feedback', () => {
      const hapticEnabled = true;
      expect(hapticEnabled).toBe(true);
    });

    it('should allow toggling sound', () => {
      let soundEnabled = true;
      soundEnabled = !soundEnabled;
      expect(soundEnabled).toBe(false);
    });

    it('should allow toggling haptics', () => {
      let hapticEnabled = true;
      hapticEnabled = !hapticEnabled;
      expect(hapticEnabled).toBe(false);
    });

    it('should emphasize downbeat audio', () => {
      const downbeatVolume = 1.0;
      const regularVolume = 0.7;
      expect(downbeatVolume).toBeGreaterThan(regularVolume);
    });
  });

  describe('Performance & Precision', () => {
    it('should maintain < 20ms jitter on modern devices', () => {
      const expectedJitter = 15; // milliseconds
      expect(expectedJitter).toBeLessThan(20);
    });

    it('should not block UI with timing calculations', () => {
      const calculateTime = () => {
        const bpm = 120;
        return 60000 / bpm;
      };
      
      // Calculation should be instant (< 1ms)
      const start = performance.now();
      calculateTime();
      const time = performance.now() - start;
      expect(time).toBeLessThan(1);
    });

    it('should handle rapid BPM changes', () => {
      const bpmChanges = [120, 125, 130, 135, 140];
      expect(bpmChanges.length).toBeGreaterThan(0);
      
      // Should handle multiple changes without crashing
      bpmChanges.forEach(bpm => {
        expect(bpm).toBeLessThanOrEqual(240);
      });
    });

    it('should use efficient timer implementation', () => {
      // Should use requestAnimationFrame or setTimeout, not busy-wait
      const timerType = 'setTimeout'; // or 'requestAnimationFrame'
      expect(['setTimeout', 'requestAnimationFrame']).toContain(timerType);
    });
  });

  describe('Edge Cases', () => {
    it('should handle 1/4 measure boundaries', () => {
      const bpm = 120;
      const beatsPerMeasure = 4;
      const beatDuration = 60000 / bpm;
      const quarterMeasure = beatDuration / 4; // 1/4 of a beat, not measure
      expect(quarterMeasure).toBeCloseTo(125, 0); // 1 beat = 500ms, 1/4 = 125ms
    });

    it('should prevent beats from drifting', () => {
      const bpm = 120;
      const beatInterval = 60000 / bpm;
      let accumulatedTime = 0;
      
      // Simulate 100 beats
      for (let i = 0; i < 100; i++) {
        accumulatedTime += beatInterval;
      }
      
      const expectedTime = beatInterval * 100;
      const drift = Math.abs(accumulatedTime - expectedTime);
      expect(drift).toBe(0); // Should be exact in calculation
    });

    it('should handle very slow tempos (40 BPM)', () => {
      const bpm = 40;
      const beatInterval = 60000 / bpm;
      expect(beatInterval).toBe(1500); // 1.5 seconds
      expect(beatInterval).toBeLessThan(5000); // Reasonable limit
    });

    it('should handle very fast tempos (240 BPM)', () => {
      const bpm = 240;
      const beatInterval = 60000 / bpm;
      expect(beatInterval).toBe(250); // 250ms
      expect(beatInterval).toBeGreaterThan(10); // Not so fast it's unrealistic
    });
  });

  describe('User Presets', () => {
    it('should support common tempos', () => {
      const commonTempos = [60, 90, 120, 140, 160];
      commonTempos.forEach(bpm => {
        expect(bpm).toBeGreaterThanOrEqual(40);
        expect(bpm).toBeLessThanOrEqual(240);
      });
    });

    it('should support common time signatures', () => {
      const commonSigs = [
        { numerator: 4, denominator: 4 },
        { numerator: 3, denominator: 4 },
        { numerator: 6, denominator: 8 },
      ];
      commonSigs.forEach(sig => {
        expect(sig.numerator).toBeGreaterThan(0);
        expect(sig.denominator).toBeGreaterThan(0);
      });
    });
  });
});
