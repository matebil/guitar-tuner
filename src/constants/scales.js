/**
 * Matebil Guitar Tuner — Scales & Modes
 * Datos de escalas, modos y patrones de 3 notas por cuerda
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Display arrays — sharp keys (C G D A E B F# C#) vs flat keys (F Bb Eb Ab)
const NOTE_SHARP_DISPLAY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_FLAT_DISPLAY  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Root indices (0-11) whose key signature uses flats: F(5), Bb/A#(10), Eb/D#(3), Ab/G#(8)
const FLAT_KEY_ROOT_INDICES = new Set([3, 5, 8, 10]);

// Helper: pick the right enharmonic spelling for a note given the root of the key
function noteDisplay(noteIdx, rootIdx) {
  return FLAT_KEY_ROOT_INDICES.has(rootIdx)
    ? NOTE_FLAT_DISPLAY[noteIdx]
    : NOTE_SHARP_DISPLAY[noteIdx];
}

// Returns the parent major scale root index from a modal root + modeKey.
// e.g. G# Locrian (offset 11) → parentRootIdx = (8 - 11 + 12) % 12 = 9 = A
function getParentRootIdx(rootNote, modeKey) {
  const rootIdx = NOTE_NAMES.indexOf(rootNote);
  return (rootIdx - MODE_DEGREE_OFFSET[modeKey] + 12) % 12;
}

// Returns the correctly-spelled display name for a modal root.
// Uses the PARENT major key's sharp/flat preference, not the modal root itself.
// e.g. G# Locrian → parent = A major (sharp key) → 'G#' not 'Ab'
export function getRootNoteDisplay(rootNote, modeKey) {
  const rootIdx = NOTE_NAMES.indexOf(rootNote);
  const parentRootIdx = getParentRootIdx(rootNote, modeKey);
  return noteDisplay(rootIdx, parentRootIdx);
}

// Para ROOT_DISPLAY seguimos usando la mezcla habitual (solo para el selector de raíz)
const NOTE_DISPLAY = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// MIDI base para cada cuerda en afinación estándar (E A D G B E)
// E2=40, A2=45, D3=50, G3=55, B3=59, E4=64
const STRING_MIDI = [40, 45, 50, 55, 59, 64]; // String 6 → String 1

export const MODES = {
  ionian: {
    name: 'Ionian',
    altName: 'Major scale',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    characteristic: 'Bright & happy',
    description: 'The standard major scale (W W H W W W H). Sounds happy and resolved. Think "Happy Birthday" or classic pop.',
    emoji: '☀️',
    degree: 1,
  },
  dorian: {
    name: 'Dorian',
    altName: 'Jazz minor',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    characteristic: 'Minor, jazzy & soulful',
    description: 'Minor scale with a raised 6th (W H W W W H W). Soulful and jazzy. Used in funk, jazz, and rock. Think Santana\'s "Oye Como Va".',
    emoji: '🎷',
    degree: 2,
  },
  phrygian: {
    name: 'Phrygian',
    altName: 'Spanish / dark',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    characteristic: 'Dark & flamenco',
    description: 'Minor scale with a lowered 2nd (H W W W H W W). Exotic and dark. The foundation of flamenco and metal riffs.',
    emoji: '💃',
    degree: 3,
  },
  lydian: {
    name: 'Lydian',
    altName: 'Dreamy',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    characteristic: 'Magical & floating',
    description: 'Major scale with a raised 4th (W W W H W W H). Dreamy and ethereal. Loved by film composers like John Williams.',
    emoji: '✨',
    degree: 4,
  },
  mixolydian: {
    name: 'Mixolydian',
    altName: 'Rock & blues',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    characteristic: 'Bluesy & dominant',
    description: 'Major scale with a lowered 7th (W W H W W H W). The rock and blues mode. Think "Sweet Home Alabama" or "Wonderwall".',
    emoji: '🎸',
    degree: 5,
  },
  aeolian: {
    name: 'Aeolian',
    altName: 'Natural minor',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    characteristic: 'Sad & emotional',
    description: 'The natural minor scale (W H W W H W W). The most common minor sound. Think "Stairway to Heaven" or most minor-key songs.',
    emoji: '🌙',
    degree: 6,
  },
  locrian: {
    name: 'Locrian',
    altName: 'Diminished',
    intervals: [0, 1, 3, 5, 6, 8, 10],
    characteristic: 'Tense & unstable',
    description: 'Has both a lowered 2nd and a lowered 5th (H W W H W W W). Very dark and dissonant. Rarely used in full — mostly for passing phrases.',
    emoji: '⚡',
    degree: 7,
  },
};

// Notas raíz disponibles (internamente con sostenidos)
export const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Nombres de display más naturales (con bemoles donde corresponde)
export const ROOT_DISPLAY = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Devuelve los índices (0-11) de las notas de la escala
 * Ej: getScaleNotes('A', 'dorian') → [9, 11, 0, 2, 4, 6, 7]
 */
export function getScaleNotes(rootNote, modeKey) {
  const mode = MODES[modeKey];
  const rootIdx = NOTE_NAMES.indexOf(rootNote);
  return mode.intervals.map(interval => (rootIdx + interval) % 12);
}

/**
 * Devuelve los nombres de las notas de la escala para mostrar
 * Ej: getScaleNoteNames('A', 'dorian') → ['A', 'B', 'C', 'D', 'E', 'F#', 'G']
 */
export function getScaleNoteNames(rootNote, modeKey) {
  const parentRootIdx = getParentRootIdx(rootNote, modeKey);
  return getScaleNotes(rootNote, modeKey).map(idx => noteDisplay(idx, parentRootIdx));
}

/**
 * Calcula el patrón de 3 notas por cuerda para una escala/modo dados.
 *
 * Anchors the pattern to the PARENT MAJOR SCALE position so that all 7 modes
 * of the same root major scale show the same frets on the neck — just with a
 * different note highlighted as the modal root.
 *
 * Example: A Ionian, B Dorian, C# Phrygian, D Lydian, E Mixolydian,
 *          F# Aeolian, G# Locrian all start from fret 5 on the low E string
 *          (the A on string 6) and use frets ~5-10, because they all belong
 *          to the A major parent scale.
 *
 * @param {string} rootNote - Modal root ('B' for B Dorian, 'A' for A Ionian…)
 * @param {string} modeKey  - Mode key ('dorian', 'ionian', etc.)
 * @returns {Array} Array of 6 elements (string 6 in [0], string 1 in [5])
 *   Each element: { stringNumber, notes: [{fret, noteName, isRoot, degree}] }
 */

// How many semitones above the parent major root each mode starts on
const MODE_DEGREE_OFFSET = {
  ionian:     0,
  dorian:     2,
  phrygian:   4,
  lydian:     5,
  mixolydian: 7,
  aeolian:    9,
  locrian:    11,
};

export function getThreeNotesPerString(rootNote, modeKey) {
  const mode = MODES[modeKey];
  const rootIdx = NOTE_NAMES.indexOf(rootNote);
  const parentRootIdx = getParentRootIdx(rootNote, modeKey);
  const scaleNoteIndices = mode.intervals.map(i => (rootIdx + i) % 12);

  // ── Anchor: find the MODAL ROOT on string 6 (low E, MIDI 40) ───────────
  // Each mode/root gets its own position on the neck.
  // e.g. A Dorian starts at fret 5 (A on string 6),
  //      B Phrygian starts at fret 7 (B on string 6), etc.
  const string6Midi = STRING_MIDI[0]; // 40 = E2
  let modalFretString6 = 0;
  for (let f = 0; f <= 11; f++) {
    if ((string6Midi + f) % 12 === rootIdx) {
      modalFretString6 = f;
      break;
    }
  }

  const result = [];
  // Start one step before the modal root so the first note found is the root itself.
  let lastAbsMidi = string6Midi + modalFretString6 - 1;

  for (let strIdx = 0; strIdx < 6; strIdx++) {
    const stringMidi = STRING_MIDI[strIdx];
    const stringNotes = [];

    // Traste inicial: el primer traste que supera la última nota tocada
    const startFret = Math.max(0, lastAbsMidi + 1 - stringMidi);

    let fret = startFret;
    while (stringNotes.length < 3 && fret <= startFret + 16) {
      const noteIdx = (stringMidi + fret) % 12;
      if (scaleNoteIndices.includes(noteIdx)) {
        stringNotes.push({
          fret,
          noteName: noteDisplay(noteIdx, parentRootIdx),
          noteNameSharp: NOTE_NAMES[noteIdx],
          isRoot: noteIdx === rootIdx,
          degree: scaleNoteIndices.indexOf(noteIdx) + 1, // 1-indexed
        });
        lastAbsMidi = stringMidi + fret;
      }
      fret++;
    }

    result.push({
      stringNumber: 6 - strIdx, // 6, 5, 4, 3, 2, 1
      notes: stringNotes,
    });
  }

  return result;
}

// ── Pentatonic & Diatonic Chords ─────────────────────────────────────────────

const PENTATONIC_INTERVALS = {
  major: [0, 2, 4, 7, 9],
  minor: [0, 3, 5, 7, 10],
};

/**
 * Returns the diatonic chords for a given scale (root + mode).
 * Each chord includes its roman numeral, quality, and suggested pentatonic type.
 */
export function getDiatonicChords(rootNote, modeKey) {
  const mode = MODES[modeKey];
  const rootIdx = NOTE_NAMES.indexOf(rootNote);
  const parentRootIdx = getParentRootIdx(rootNote, modeKey);
  const intervals = mode.intervals;
  const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

  return intervals.map((_, i) => {
    const chordRootSemitone = intervals[i];
    const chordRootIdx = (rootIdx + chordRootSemitone) % 12;

    const thirdInterval = (intervals[(i + 2) % 7] - chordRootSemitone + 12) % 12;
    const fifthInterval = (intervals[(i + 4) % 7] - chordRootSemitone + 12) % 12;

    let quality, symbol, pentatonicType;
    if (thirdInterval === 4 && fifthInterval === 7) {
      quality = 'major'; symbol = ''; pentatonicType = 'major';
    } else if (thirdInterval === 3 && fifthInterval === 7) {
      quality = 'minor'; symbol = 'm'; pentatonicType = 'minor';
    } else if (thirdInterval === 3 && fifthInterval === 6) {
      quality = 'dim'; symbol = '°'; pentatonicType = 'minor';
    } else {
      quality = 'aug'; symbol = '+'; pentatonicType = 'major';
    }

    let roman = romanNumerals[i];
    if (quality === 'minor' || quality === 'dim') {
      roman = romanNumerals[i].toLowerCase();
      if (quality === 'dim') roman += '°';
    } else if (quality === 'aug') {
      roman += '+';
    }

    const chordName = noteDisplay(chordRootIdx, parentRootIdx);
    const pentLabel = pentatonicType === 'major' ? 'Maj' : 'Min';

    return {
      degree: i + 1,
      roman,
      rootIdx: chordRootIdx,
      rootName: chordName,
      quality,
      symbol,
      name: chordName + symbol,
      pentatonicType,
      pentatonicLabel: `${chordName} ${pentLabel} Pentatonic`,
    };
  });
}

/**
 * Returns note display names for a pentatonic scale.
 * @param {number} chordRootIdx  Chromatic index (0-11) of the pentatonic root
 * @param {string} pentatonicType 'major' or 'minor'
 * @param {number} displayRootIdx Parent key root index for sharp/flat spelling
 */
export function getPentatonicNoteNames(chordRootIdx, pentatonicType, displayRootIdx) {
  const intervals = PENTATONIC_INTERVALS[pentatonicType];
  return intervals.map(i => noteDisplay((chordRootIdx + i) % 12, displayRootIdx));
}

/**
 * Returns a 2-notes-per-string fretboard pattern for a pentatonic scale.
 * @param {number} chordRootIdx  Chromatic index (0-11) of the pentatonic root
 * @param {string} pentatonicType 'major' or 'minor'
 * @param {number} displayRootIdx Parent key root index for sharp/flat spelling
 */
export function getPentatonicPattern(chordRootIdx, pentatonicType, displayRootIdx) {
  const intervals = PENTATONIC_INTERVALS[pentatonicType];
  const pentatonicNotes = intervals.map(i => (chordRootIdx + i) % 12);

  let modalFretString6 = 0;
  for (let f = 0; f <= 11; f++) {
    if ((STRING_MIDI[0] + f) % 12 === chordRootIdx) {
      modalFretString6 = f;
      break;
    }
  }

  const result = [];
  let lastAbsMidi = STRING_MIDI[0] + modalFretString6 - 1;

  for (let strIdx = 0; strIdx < 6; strIdx++) {
    const stringMidi = STRING_MIDI[strIdx];
    const stringNotes = [];
    const startFret = Math.max(0, lastAbsMidi + 1 - stringMidi);

    let fret = startFret;
    while (stringNotes.length < 2 && fret <= startFret + 16) {
      const noteIdx = (stringMidi + fret) % 12;
      if (pentatonicNotes.includes(noteIdx)) {
        stringNotes.push({
          fret,
          noteName: noteDisplay(noteIdx, displayRootIdx),
          noteNameSharp: NOTE_NAMES[noteIdx],
          isRoot: noteIdx === chordRootIdx,
          degree: pentatonicNotes.indexOf(noteIdx) + 1,
        });
        lastAbsMidi = stringMidi + fret;
      }
      fret++;
    }

    result.push({
      stringNumber: 6 - strIdx,
      notes: stringNotes,
    });
  }

  return result;
}
