// Note names in chromatic order
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Generate all fret positions (0-14) for a string
 * @param {object} openString - The open string configuration
 * @param {number} maxFret - Maximum fret to generate (default 14)
 * @returns {array} - Array of all fret positions with frequencies
 */
function generateFretPositions(openString, maxFret = 24) {
  const positions = [];
  const semitoneRatio = Math.pow(2, 1/12);
  
  for (let fret = 0; fret <= maxFret; fret++) {
    const frequency = openString.frequency * Math.pow(semitoneRatio, fret);
    
    // Calculate the note name for this fret
    const noteIndex = (NOTE_NAMES.indexOf(openString.name) + fret) % 12;
    const noteName = NOTE_NAMES[noteIndex];
    
    positions.push({
      name: openString.name,
      note: `${noteName}${fret === 0 ? '' : ` (fret ${fret})`}`,
      actualNote: noteName,  // Clean note name for display (F, F#, G, etc.)
      frequency: parseFloat(frequency.toFixed(2)),
      stringNumber: openString.stringNumber,
      fret: fret,
      displayName: fret === 0 ? openString.name : `${openString.name}-${noteName}`,
    });
  }
  
  return positions;
}

/**
 * Generate tuning with all fret positions
 * @param {string} name - Tuning name
 * @param {array} openStrings - Array of open string configurations
 * @returns {object} - Complete tuning with all fret positions
 */
function generateTuning(name, openStrings) {
  const allPositions = [];
  
  openStrings.forEach(openString => {
    const fretPositions = generateFretPositions(openString);
    allPositions.push(...fretPositions);
  });
  
  return {
    name,
    hz: 440,
    strings: openStrings, // Keep open strings for reference
    allPositions, // All fret positions for detection
  };
}

// Define open strings for each tuning
const STANDARD_OPEN = [
  { name: 'E', note: 'E2', frequency: 82.41, stringNumber: 6 },
  { name: 'A', note: 'A2', frequency: 110.00, stringNumber: 5 },
  { name: 'D', note: 'D3', frequency: 146.83, stringNumber: 4 },
  { name: 'G', note: 'G3', frequency: 196.00, stringNumber: 3 },
  { name: 'B', note: 'B3', frequency: 246.94, stringNumber: 2 },
  { name: 'E', note: 'E4', frequency: 329.63, stringNumber: 1 },
];

const DROP_D_OPEN = [
  { name: 'D', note: 'D2', frequency: 73.42, stringNumber: 6 },
  { name: 'A', note: 'A2', frequency: 110.00, stringNumber: 5 },
  { name: 'D', note: 'D3', frequency: 146.83, stringNumber: 4 },
  { name: 'G', note: 'G3', frequency: 196.00, stringNumber: 3 },
  { name: 'B', note: 'B3', frequency: 246.94, stringNumber: 2 },
  { name: 'E', note: 'E4', frequency: 329.63, stringNumber: 1 },
];

const HALF_STEP_DOWN_OPEN = [
  { name: 'Eb', note: 'Eb2', frequency: 77.78, stringNumber: 6 },
  { name: 'Ab', note: 'Ab2', frequency: 103.83, stringNumber: 5 },
  { name: 'Db', note: 'Db3', frequency: 138.59, stringNumber: 4 },
  { name: 'Gb', note: 'Gb3', frequency: 185.00, stringNumber: 3 },
  { name: 'Bb', note: 'Bb3', frequency: 233.08, stringNumber: 2 },
  { name: 'Eb', note: 'Eb4', frequency: 311.13, stringNumber: 1 },
];

const OPEN_G_OPEN = [
  { name: 'D', note: 'D2', frequency: 73.42, stringNumber: 6 },
  { name: 'G', note: 'G2', frequency: 98.00, stringNumber: 5 },
  { name: 'D', note: 'D3', frequency: 146.83, stringNumber: 4 },
  { name: 'G', note: 'G3', frequency: 196.00, stringNumber: 3 },
  { name: 'B', note: 'B3', frequency: 246.94, stringNumber: 2 },
  { name: 'D', note: 'D4', frequency: 293.66, stringNumber: 1 },
];

export const TUNINGS = {
  standard: generateTuning('Standard (E)', STANDARD_OPEN),
  dropD: generateTuning('Drop D', DROP_D_OPEN),
  halfStepDown: generateTuning('Half Step Down (Eb)', HALF_STEP_DOWN_OPEN),
  openG: generateTuning('Open G', OPEN_G_OPEN),
};

// Default tuning
export const DEFAULT_TUNING = 'standard';
