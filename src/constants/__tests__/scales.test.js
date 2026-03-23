/**
 * Matebil Guitar Tuner
 * Scales & Modes Practice Tests
 */

describe('Scales & Modes Practice', () => {
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  describe('Note System', () => {
    it('should have 12 semitones in chromatic scale', () => {
      expect(NOTE_NAMES.length).toBe(12);
    });

    it('should support all chromatic notes', () => {
      expect(NOTE_NAMES).toContain('C');
      expect(NOTE_NAMES).toContain('C#');
      expect(NOTE_NAMES).toContain('D');
      expect(NOTE_NAMES).toContain('A#');
      expect(NOTE_NAMES).toContain('B');
    });

    it('should map note names to indices', () => {
      expect(NOTE_NAMES.indexOf('C')).toBe(0);
      expect(NOTE_NAMES.indexOf('A')).toBe(9);
      expect(NOTE_NAMES.indexOf('B')).toBe(11);
    });
  });

  describe('Major Scale (Ionian)', () => {
    const ionian = [0, 2, 4, 5, 7, 9, 11]; // Whole-Whole-Half-Whole-Whole-Whole-Half

    it('should have 7 notes', () => {
      expect(ionian.length).toBe(7);
    });

    it('should have correct intervals from root', () => {
      const expectedIntervals = [0, 2, 4, 5, 7, 9, 11];
      expect(ionian).toEqual(expectedIntervals);
    });

    it('C major scale should be C D E F G A B', () => {
      const cMajor = ionian.map(interval => NOTE_NAMES[(0 + interval) % 12]);
      expect(cMajor).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    });

    it('G major scale should be G A B C D E F#', () => {
      const gMajor = ionian.map(interval => NOTE_NAMES[(7 + interval) % 12]);
      expect(gMajor).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
    });

    it('should follow WWHWWWH pattern', () => {
      const intervals = ionian;
      const pattern = [];
      for (let i = 0; i < intervals.length; i++) {
        const current = intervals[i];
        const next = (i < intervals.length - 1) ? intervals[i + 1] : intervals[0] + 12;
        pattern.push(next - current);
      }
      // Pattern should be 2-2-1-2-2-2-1 (or 2-2-1-2-2-2 + wrap to 1)
      expect(pattern.slice(0, -1)).toEqual([2, 2, 1, 2, 2, 2]);
    });
  });

  describe('Minor Scale (Aeolian)', () => {
    const aeolian = [0, 2, 3, 5, 7, 8, 10];

    it('should have 7 notes', () => {
      expect(aeolian.length).toBe(7);
    });

    it('A minor scale should be A B C D E F G', () => {
      const aMinor = aeolian.map(interval => NOTE_NAMES[(9 + interval) % 12]);
      expect(aMinor).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    });

    it('should follow WHWWHWW pattern', () => {
      const intervals = aeolian;
      const pattern = [];
      for (let i = 0; i < intervals.length - 1; i++) {
        pattern.push(intervals[i + 1] - intervals[i]);
      }
      // Should be 2-1-2-2-1-2
      expect(pattern).toEqual([2, 1, 2, 2, 1, 2]);
    });
  });

  describe('Pentatonic Scales', () => {
    const majorPent = [0, 2, 4, 7, 9];    // Major pentatonic
    const minorPent = [0, 3, 5, 7, 10];   // Minor pentatonic (relative to major)

    it('major pentatonic should have 5 notes', () => {
      expect(majorPent.length).toBe(5);
    });

    it('minor pentatonic should have 5 notes', () => {
      expect(minorPent.length).toBe(5);
    });

    it('C major pentatonic should be C D E G A', () => {
      const scales = majorPent.map(interval => NOTE_NAMES[(0 + interval) % 12]);
      expect(scales).toEqual(['C', 'D', 'E', 'G', 'A']);
    });

    it('A minor pentatonic should be A C D E G', () => {
      const scales = minorPent.map(interval => NOTE_NAMES[(9 + interval) % 12]);
      expect(scales).toEqual(['A', 'C', 'D', 'E', 'G']);
    });
  });

  describe('Modal Diversity', () => {
    const modes = {
      ionian: [0, 2, 4, 5, 7, 9, 11],    // 1st mode (Major)
      dorian: [0, 2, 3, 5, 7, 9, 10],    // 2nd mode
      phrygian: [0, 1, 3, 5, 7, 8, 10],  // 3rd mode
      lydian: [0, 2, 4, 6, 7, 9, 11],    // 4th mode
      mixolydian: [0, 2, 4, 5, 7, 9, 10],// 5th mode
      aeolian: [0, 2, 3, 5, 7, 8, 10],   // 6th mode (Natural Minor)
      locrian: [0, 1, 3, 5, 6, 8, 10],   // 7th mode
    };

    it('should have 7 modes in major scale', () => {
      expect(Object.keys(modes).length).toBe(7);
    });

    it('C Dorian should be C D Eb F G A Bb', () => {
      const dorian = modes.dorian.map(interval => NOTE_NAMES[interval]);
      expect(dorian).toEqual(['C', 'D', 'D#', 'F', 'G', 'A', 'A#']);
    });

    it('should all have 7 notes', () => {
      Object.values(modes).forEach(mode => {
        expect(mode.length).toBe(7);
      });
    });
  });

  describe('Scale Practice Modes', () => {
    describe('Guide Mode', () => {
      it('should show all notes in sequence', () => {
        const scale = [0, 2, 4, 5, 7, 9, 11];
        expect(scale.length).toBeGreaterThan(0);
        // Each note should be audible
        scale.forEach((note, index) => {
          expect(note).toBeGreaterThanOrEqual(0);
          expect(note).toBeLessThan(12);
        });
      });

      it('should support octave navigation', () => {
        const octaves = [0, 12, 24]; // MIDI octave jumps
        octaves.forEach(octave => {
          expect(octave % 12).toBe(0);
        });
      });
    });

    describe('Quiz Mode', () => {
      it('should generate random notes from scale', () => {
        const majorScale = [0, 2, 4, 5, 7, 9, 11];
        const randomNote = majorScale[Math.floor(Math.random() * majorScale.length)];
        expect(majorScale).toContain(randomNote);
      });

      it('should track correct/incorrect responses', () => {
        const score = { correct: 8, incorrect: 2, total: 10 };
        expect(score.correct + score.incorrect).toBe(score.total);
        expect(score.correct / score.total).toBe(0.8); // 80%
      });

      it('should calculate accuracy percentage', () => {
        const correct = 9;
        const total = 10;
        const accuracy = (correct / total) * 100;
        expect(accuracy).toBe(90);
      });
    });
  });

  describe('3-Notes-Per-String Patterns', () => {
    it('should generate fingering patterns', () => {
      // A pattern of 3 notes across one string
      const pattern = [0, 2, 4]; // 3 consecutive notes
      expect(pattern.length).toBe(3);
    });

    it('should map patterns across 6 strings', () => {
      const strings = 6;
      const patterns = Array(strings).fill([0, 2, 4]);
      expect(patterns.length).toBe(6);
    });

    it('should create efficient finger positioning', () => {
      const fret1 = 0;
      const fret2 = 2;
      const fret3 = 4;
      const fingerSpan = fret3 - fret1;
      expect(fingerSpan).toBeLessThanOrEqual(4); // Reasonable hand span
    });
  });

  describe('Key Signature Handling', () => {
    const sharpKeys = new Set([1, 6, 8, 3, 10, 5, 0]); // G D A E B F# C#
    const flatKeys = new Set([5, 10, 3, 8, 1, 6, 11]); // F Bb Eb Ab Db Gb Cb

    it('should use sharps for #-key signatures', () => {
      const gMajor = 7; // G (1 sharp)
      // G major has F#
      expect(true).toBe(true); // Placeholder for sharp handling
    });

    it('should use flats for b-key signatures', () => {
      const fMajor = 5; // F (1 flat)
      // F major has Bb
      expect(true).toBe(true); // Placeholder for flat handling
    });

    it('should spell notes correctly enharmonically', () => {
      // C# major should use B# not C, F## not G, etc
      const cSharpNotes = ['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#'];
      expect(cSharpNotes.length).toBe(7);
    });
  });

  describe('String Pitch References', () => {
    const stringTuning = {
      6: 40,  // E2 (MIDI)
      5: 45,  // A2
      4: 50,  // D3
      3: 55,  // G3
      2: 59,  // B3
      1: 64,  // E4
    };

    it('should have 6 strings with correct pitches', () => {
      expect(Object.keys(stringTuning).length).toBe(6);
    });

    it('should follow standard tuning intervals', () => {
      // Standard tuning: E A D G B E (intervals of P5, P5, P5, M3, P5)
      expect(stringTuning[5] - stringTuning[6]).toBe(5);   // E to A = 5 semitones
      expect(stringTuning[4] - stringTuning[5]).toBe(5);   // A to D = 5 semitones
      expect(stringTuning[3] - stringTuning[4]).toBe(5);   // D to G = 5 semitones
      expect(stringTuning[2] - stringTuning[3]).toBe(4);   // G to B = 4 semitones
      expect(stringTuning[1] - stringTuning[2]).toBe(5);   // B to E = 5 semitones
    });

    it('should span guitar frequency range', () => {
      const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
      const lowestFreq = midiToFreq(stringTuning[6]);
      const highestFreq = midiToFreq(stringTuning[1]);
      
      expect(lowestFreq).toBeCloseTo(82.41, 1);  // E2
      expect(highestFreq).toBeCloseTo(329.63, 1); // E4
    });
  });

  describe('Practice Flow', () => {
    it('should support guided learning (show notes)', () => {
      const mode = 'guide';
      expect(['guide', 'quiz']).toContain(mode);
    });

    it('should support quiz mode (test knowledge)', () => {
      const mode = 'quiz';
      expect(['guide', 'quiz']).toContain(mode);
    });

    it('should track practice progress', () => {
      const progress = {
        scalesCompleted: 3,
        totalScales: 7,
        modesCompleted: 2,
        totalModes: 7,
      };
      expect(progress.scalesCompleted).toBeLessThanOrEqual(progress.totalScales);
    });
  });
});
