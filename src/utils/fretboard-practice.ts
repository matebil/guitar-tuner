export type FretboardQ = {
  stringNumber: number;  // 1-6 (1 = mi agudo, 6 = mi grave)
  fret: number;          // 0-24
  correctNote: string;
  options: string[];
};

export type FretboardMode = 'single' | 'by-fret';
export type FretboardDifficulty = 'easy' | 'medium' | 'hard';

export type FretboardPositionStats = {
  attempts: number;
  totalMs: number;
  mastered: boolean;
};

export type ByFretRound = {
  fret: number;
  currentString: number;
  remainingStrings: number[];
  revealed: boolean;
};

export type FretboardAttemptRow = {
  timestamp: number;
  mode: FretboardMode;
  stringNumber: number;
  fret: number;
  note: string;
  responseMs: number;
  correct: boolean;
  mastered: boolean;
};

const FB_NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const OPEN_MIDI = [64, 59, 55, 50, 45, 40];

export const ALL_STRINGS = [1, 2, 3, 4, 5, 6];

export function getNoteForPosition(stringNumber: number, fret: number): string {
  const stringIdx = Math.min(5, Math.max(0, stringNumber - 1));
  const noteChroma = (OPEN_MIDI[stringIdx] + fret) % 12;
  return FB_NOTES[noteChroma];
}

export function positionKey(stringNumber: number, fret: number): string {
  return `${stringNumber}:${fret}`;
}

export function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function makeFretboardQuestion(
  _difficulty: FretboardDifficulty,
  excludedKeys: Set<string> = new Set()
): FretboardQ {
  const maxFret = 24;

  const candidates: Array<{ stringNumber: number; fret: number }> = [];
  for (const stringNumber of ALL_STRINGS) {
    for (let fret = 0; fret <= maxFret; fret++) {
      if (!excludedKeys.has(positionKey(stringNumber, fret))) {
        candidates.push({ stringNumber, fret });
      }
    }
  }

  const pool = candidates.length > 0
    ? candidates
    : ALL_STRINGS.flatMap((stringNumber) =>
      Array.from({ length: maxFret + 1 }, (_, fret) => ({ stringNumber, fret }))
    );

  const target = randomFrom(pool);
  const correctNote = getNoteForPosition(target.stringNumber, target.fret);
  const noteChroma = FB_NOTES.indexOf(correctNote);

  const neighbors = [
    (noteChroma - 2 + 12) % 12,
    (noteChroma - 1 + 12) % 12,
    (noteChroma + 1) % 12,
    (noteChroma + 2) % 12,
  ];
  const wrong: string[] = [];
  const used = new Set([correctNote]);
  for (const ci of neighbors) {
    const n = FB_NOTES[ci];
    if (!used.has(n) && wrong.length < 3) {
      wrong.push(n);
      used.add(n);
    }
  }

  const rest = FB_NOTES.filter((n) => !used.has(n)).sort(() => Math.random() - 0.5);
  for (const n of rest) {
    if (wrong.length >= 3) break;
    wrong.push(n);
  }

  const options = [correctNote, ...wrong].sort(() => Math.random() - 0.5);
  return { stringNumber: target.stringNumber, fret: target.fret, correctNote, options };
}

export function makeByFretRound(): ByFretRound {
  const fret = Math.floor(Math.random() * 25);
  const currentString = randomFrom(ALL_STRINGS);
  const remainingStrings = ALL_STRINGS.filter((n) => n !== currentString);
  return { fret, currentString, remainingStrings, revealed: false };
}

export function csvEscape(value: string | number | boolean): string {
  const str = String(value ?? '');
  if (!str.includes(',') && !str.includes('"') && !str.includes('\n')) {
    return str;
  }
  return `"${str.replaceAll('"', '""')}"`;
}
