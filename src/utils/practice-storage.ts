import AsyncStorage from '@react-native-async-storage/async-storage';

const PRACTICE_KEYS = {
  screenMode: 'practiceScreenMode',
  rootNote: 'practiceRootNote',
  modeKey: 'practiceModeKey',
  practiceType: 'practiceType',
  noteTimingStats: 'practiceNoteTimingStats',
  focusSlowNotes: 'practiceFocusSlowNotes',
  fretboardPositionStats: 'practiceFretboardPositionStats',
  fretboardAttemptLog: 'practiceFretboardAttemptLog',
} as const;

export type PracticeScreenMode = 'practice' | 'guide' | 'quiz';
export type PracticeType = 'modes' | 'pentatonics';

export type PracticePersistedState = {
  screenMode?: PracticeScreenMode;
  rootNote?: string;
  modeKey?: string;
  practiceType?: PracticeType;
  noteTimingStats?: Record<string, { attempts: number; totalMs: number }>;
  focusSlowNotes?: boolean;
  fretboardPositionStats?: Record<string, { attempts: number; totalMs: number; mastered: boolean }>;
  fretboardAttemptLog?: unknown[];
};

function parseJson<T>(raw: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function loadPracticePersistedState(): Promise<PracticePersistedState> {
  const pairs = await AsyncStorage.multiGet(Object.values(PRACTICE_KEYS));
  const map = Object.fromEntries(pairs.map(([k, v]) => [k, v]));
  const screenModeRaw = map[PRACTICE_KEYS.screenMode];
  const rootNoteRaw = map[PRACTICE_KEYS.rootNote];
  const modeKeyRaw = map[PRACTICE_KEYS.modeKey];
  const practiceTypeRaw = map[PRACTICE_KEYS.practiceType];

  const state: PracticePersistedState = {};

  if (screenModeRaw === 'practice' || screenModeRaw === 'guide' || screenModeRaw === 'quiz') {
    state.screenMode = screenModeRaw;
  }

  if (rootNoteRaw) state.rootNote = rootNoteRaw;
  if (modeKeyRaw) state.modeKey = modeKeyRaw;

  if (practiceTypeRaw === 'modes' || practiceTypeRaw === 'pentatonics') {
    state.practiceType = practiceTypeRaw;
  }

  const noteTimingStats = parseJson<Record<string, { attempts: number; totalMs: number }>>(map[PRACTICE_KEYS.noteTimingStats]);
  if (noteTimingStats && typeof noteTimingStats === 'object') {
    state.noteTimingStats = noteTimingStats;
  }

  state.focusSlowNotes = map[PRACTICE_KEYS.focusSlowNotes] === '1';

  const fretboardPositionStats = parseJson<Record<string, { attempts: number; totalMs: number; mastered: boolean }>>(map[PRACTICE_KEYS.fretboardPositionStats]);
  if (fretboardPositionStats && typeof fretboardPositionStats === 'object') {
    state.fretboardPositionStats = fretboardPositionStats;
  }

  const fretboardAttemptLog = parseJson<unknown[]>(map[PRACTICE_KEYS.fretboardAttemptLog]);
  if (Array.isArray(fretboardAttemptLog)) {
    state.fretboardAttemptLog = fretboardAttemptLog;
  }

  return state;
}

export async function savePracticeScreenMode(value: PracticeScreenMode): Promise<void> {
  await AsyncStorage.setItem(PRACTICE_KEYS.screenMode, value);
}

export async function savePracticeRootNote(value: string): Promise<void> {
  await AsyncStorage.setItem(PRACTICE_KEYS.rootNote, value);
}

export async function savePracticeModeKey(value: string): Promise<void> {
  await AsyncStorage.setItem(PRACTICE_KEYS.modeKey, value);
}

export async function savePracticeType(value: PracticeType): Promise<void> {
  await AsyncStorage.setItem(PRACTICE_KEYS.practiceType, value);
}

export async function savePracticeNoteTimingStats(value: Record<string, { attempts: number; totalMs: number }>): Promise<void> {
  await AsyncStorage.setItem(PRACTICE_KEYS.noteTimingStats, JSON.stringify(value));
}

export async function savePracticeFocusSlowNotes(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(PRACTICE_KEYS.focusSlowNotes, enabled ? '1' : '0');
}

export async function savePracticeFretboardPositionStats(value: Record<string, { attempts: number; totalMs: number; mastered: boolean }>): Promise<void> {
  await AsyncStorage.setItem(PRACTICE_KEYS.fretboardPositionStats, JSON.stringify(value));
}

export async function savePracticeFretboardAttemptLog(value: unknown[]): Promise<void> {
  await AsyncStorage.setItem(PRACTICE_KEYS.fretboardAttemptLog, JSON.stringify(value));
}
