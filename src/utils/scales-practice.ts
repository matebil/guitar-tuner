import {
  getScaleNoteNames,
  getScaleNotes,
  getThreeNotesPerString,
} from '@/src/constants/scales';

export type ChallengeType = {
  noteName: string;
  noteIdx: number;
  degreeIdx: number;
  stringHints: number[];
};

export type GuideNote = {
  stringNumber: number;
  fret: number;
  noteName: string;
  noteIdx: number;
  degree: number;
};

export function getScaleInfo(
  freq: number,
  scaleNotes: number[],
  refPitch: number = 440
): { inScale: boolean; degreeIdx: number } {
  if (!freq || freq <= 0) return { inScale: false, degreeIdx: -1 };

  const midiFloat = 12 * Math.log2(freq / refPitch) + 69;

  let closestDegreeIdx = -1;
  let closestCents = Infinity;

  for (let i = 0; i < scaleNotes.length; i++) {
    const noteClass = scaleNotes[i];
    const nearestMidi = Math.round((midiFloat - noteClass) / 12) * 12 + noteClass;
    const cents = Math.abs((midiFloat - nearestMidi) * 100);
    if (cents < closestCents) {
      closestCents = cents;
      closestDegreeIdx = i;
    }
  }

  const inScale = closestCents <= 25;
  return { inScale, degreeIdx: inScale ? closestDegreeIdx : -1 };
}

export function makeChallenge(
  rootNote: string,
  modeKey: string,
  prevNoteIdx?: number,
  priorityNoteIdxs: number[] = []
): ChallengeType {
  const scaleNoteIndices = getScaleNotes(rootNote, modeKey);
  const scaleNames = getScaleNoteNames(rootNote, modeKey);
  const pattern = getThreeNotesPerString(rootNote, modeKey);

  const allDegreeIndices = Array.from({ length: scaleNoteIndices.length }, (_, i) => i);
  const prioritizedDegreeIndices = priorityNoteIdxs.length > 0
    ? allDegreeIndices.filter((idx) => priorityNoteIdxs.includes(scaleNoteIndices[idx]))
    : allDegreeIndices;
  const candidateDegreeIndices = prioritizedDegreeIndices.length > 0
    ? prioritizedDegreeIndices
    : allDegreeIndices;

  let degreeIdx = candidateDegreeIndices[Math.floor(Math.random() * candidateDegreeIndices.length)];
  if (prevNoteIdx !== undefined && scaleNoteIndices[degreeIdx] === prevNoteIdx) {
    const nonRepeatedCandidates = candidateDegreeIndices.filter(
      (idx) => scaleNoteIndices[idx] !== prevNoteIdx
    );
    if (nonRepeatedCandidates.length > 0) {
      degreeIdx = nonRepeatedCandidates[Math.floor(Math.random() * nonRepeatedCandidates.length)];
    }
  }

  const noteIdx = scaleNoteIndices[degreeIdx];
  const noteName = scaleNames[degreeIdx];

  const stringHints: number[] = [];
  for (const str of pattern) {
    if ((str as any).notes.some((n: any) => n.degree === degreeIdx + 1)) {
      stringHints.push((str as any).stringNumber);
    }
  }

  return { noteName, noteIdx, degreeIdx, stringHints };
}

export function buildGuideSequence(
  rootNote: string,
  modeKey: string,
  direction: 'asc' | 'desc'
): GuideNote[] {
  const scaleNoteIndices = getScaleNotes(rootNote, modeKey);
  const pattern = getThreeNotesPerString(rootNote, modeKey);

  const sequence: GuideNote[] = [];
  for (const str of pattern) {
    for (const note of (str as any).notes) {
      sequence.push({
        stringNumber: (str as any).stringNumber,
        fret: note.fret,
        noteName: note.noteName,
        noteIdx: scaleNoteIndices[note.degree - 1],
        degree: note.degree,
      });
    }
  }
  return direction === 'desc' ? [...sequence].reverse() : sequence;
}

export function cyclePrev<T>(arr: T[], current: T): T {
  const idx = arr.indexOf(current);
  return arr[(idx - 1 + arr.length) % arr.length];
}

export function cycleNext<T>(arr: T[], current: T): T {
  const idx = arr.indexOf(current);
  return arr[(idx + 1) % arr.length];
}
