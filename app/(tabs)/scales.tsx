/**
 * Matebil Guitar Tuner — Scales & Modes Screen
 * Práctica de escalas: visualizador de mástil (3 notas por cuerda)
 * + detección en tiempo real de la nota tocada
 */

import FrequencyDetector from '@/src/components/FrequencyDetector';
import {
  MODES,
  ROOT_NOTES,
  getDiatonicChords,
  getPentatonicNoteNames,
  getPentatonicPattern,
  getRootNoteDisplay,
  getScaleNoteNames,
  getScaleNotes,
  getThreeNotesPerString,
} from '@/src/constants/scales';
import { TUNINGS } from '@/src/constants/tunings';
import { useSettings } from '@/src/contexts/SettingsContext';
import {
  ALL_STRINGS,
  type ByFretRound,
  type FretboardAttemptRow,
  type FretboardDifficulty,
  type FretboardMode,
  type FretboardPositionStats,
  type FretboardQ,
  getNoteForPosition,
  makeByFretRound,
  makeFretboardQuestion,
  positionKey,
  randomFrom,
} from '@/src/utils/fretboard-practice';
import { logger } from '@/src/utils/logger';
import {
  loadPracticePersistedState,
  savePracticeFretboardAttemptLog,
  savePracticeFretboardPositionStats,
  savePracticeModeKey,
  savePracticeRootNote,
  savePracticeScreenMode,
  savePracticeType,
} from '@/src/utils/practice-storage';
import {
  buildGuideSequence,
  buildPentatonicGuideSequence,
  cycleNext,
  cyclePrev,
  getScaleInfo,
  makeChallenge,
  PENTATONIC_INFO,
  type ChallengeType,
} from '@/src/utils/scales-practice';
import { setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- Constantes de layout del mastil ---------------------------------------
const FRET_WIDTH = 46;
const STRING_HEIGHT = 34;
const DOT_SIZE = 26;
const LABEL_WIDTH = 26;

// Orden cromatico (sharps) - mismo que tunings.js
const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Mapeo de nombre de nota (sharp y flat) -> indice cromatico 0-11
const NOTE_CHROMA_MAP: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

// Etiquetas de cuerdas en orden de tab (cuerda 1 arriba)
const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];

// Orden de modos
const MODE_KEYS = [
  'ionian',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'aeolian',
  'locrian',
];

const BY_FRET_TIME_LIMITS_MS: Record<FretboardDifficulty, number> = {
  easy: 24000,
  medium: 18000,
  hard: 12000,
};

// Degree names
const DEGREE_NAMES = ['Root', '2nd', '3rd', '4th', '5th', '6th', '7th'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// ─── Ciclo de modos por escala padre ──────────────────────────────────────
// Cuántos semitonos sobre la tónica mayor empieza cada modo
const MODE_SEMITONE_OFFSET: Record<string, number> = {
  ionian: 0, dorian: 2, phrygian: 4, lydian: 5,
  mixolydian: 7, aeolian: 9, locrian: 11,
};

/**
 * Dada una raíz + modo actuales, devuelve la raíz + modo del grado adyacente
 * dentro de la misma escala mayor padre.
 * direction =  1 → siguiente grado (swipe derecha)
 * direction = -1 → grado anterior  (swipe izquierda)
 */
function getAdjacentParentMode(
  rootNote: string,
  modeKey: string,
  direction: 1 | -1
): { root: string; mode: string } {
  const rootIdx = NOTE_NAMES_SHARP.indexOf(rootNote);
  const parentRootIdx = (rootIdx - MODE_SEMITONE_OFFSET[modeKey] + 12) % 12;
  const curModeIdx = MODE_KEYS.indexOf(modeKey);
  const nextModeIdx = (curModeIdx + direction + 7) % 7;
  const nextModeKey = MODE_KEYS[nextModeIdx];
  const newRootIdx = (parentRootIdx + MODE_SEMITONE_OFFSET[nextModeKey]) % 12;
  return { root: NOTE_NAMES_SHARP[newRootIdx], mode: nextModeKey };
}

function renderModeFretCell(params: {
  f: number;
  note: any;
  colors: any;
  playedNoteIdx: number;
  detectedInScale: boolean;
  pulseAnim: Animated.Value;
}): React.ReactNode {
  const { f, note, colors, playedNoteIdx, detectedInScale, pulseAnim } = params;
  const isNut = f === 0;
  let noteDot: React.ReactNode = null;

  if (note) {
    const isPlayed = playedNoteIdx !== -1 && NOTE_NAMES_SHARP.indexOf(note.noteNameSharp) === playedNoteIdx;
    const isRoot = Boolean(note.isRoot);

    let dotBg = isRoot ? colors.primary : colors.secondary;
    let dotBorder = isRoot ? colors.primaryBorder : colors.buttonBorder;
    let dotTextColor = isRoot ? colors.textOnPrimary : colors.text;
    let dotBorderWidth = isRoot ? 2 : 1;
    let dotOpacity: number | Animated.Value = 1;
    let dotTransform: { scale: Animated.AnimatedInterpolation<number> }[] = [];

    if (isPlayed) {
      dotBg = detectedInScale ? '#22c55e' : colors.sharp;
      dotBorder = detectedInScale ? '#16a34a' : colors.sharp;
      dotTextColor = '#fff';
      dotBorderWidth = 2.5;
      dotOpacity = pulseAnim;
      dotTransform = [{
        scale: pulseAnim.interpolate({
          inputRange: [0.45, 1],
          outputRange: [1, 1.22],
        }),
      }];
    }

    noteDot = (
      <Animated.View
        style={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: DOT_SIZE / 2,
          backgroundColor: dotBg,
          borderWidth: dotBorderWidth,
          borderColor: dotBorder,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
          opacity: dotOpacity,
          transform: dotTransform,
        }}
      >
        <Text
          style={{
            color: dotTextColor,
            fontSize: note.noteName.length > 2 ? 7 : 9,
            fontWeight: 'bold',
            fontFamily: 'monospace',
          }}
        >
          {note.noteName}
        </Text>
      </Animated.View>
    );
  }

  return (
    <View
      key={f}
      style={{
        width: FRET_WIDTH,
        height: STRING_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        borderLeftWidth: isNut ? 3 : 1,
        borderLeftColor: isNut ? colors.text : colors.buttonBorder,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 1.5,
          backgroundColor: colors.buttonBorder,
          opacity: 0.8,
        }}
      />
      {noteDot}
    </View>
  );
}

function renderPentatonicFretCell(params: {
  f: number;
  note: any;
  colors: any;
  playedNoteIdx: number;
  pentNoteIdxSet: Set<number>;
  pulseAnim: Animated.Value;
}): React.ReactNode {
  const { f, note, colors, playedNoteIdx, pentNoteIdxSet, pulseAnim } = params;
  const isNut = f === 0;
  let noteDot: React.ReactNode = null;

  if (note) {
    const noteIdx = NOTE_CHROMA_MAP[note.noteName] ?? -1;
    const isPlayed = playedNoteIdx !== -1 && noteIdx === playedNoteIdx;
    const isInPentatonic = isPlayed ? pentNoteIdxSet.has(playedNoteIdx) : true;
    const isRoot = Boolean(note.isRoot);

    let dotBg = isRoot ? colors.primary : colors.secondary;
    let dotBorder = isRoot ? colors.primaryBorder : colors.buttonBorder;
    let dotTextColor = isRoot ? colors.textOnPrimary : colors.text;
    let dotBorderWidth = isRoot ? 2 : 1;
    let dotOpacity: number | Animated.Value = 1;
    let dotTransform: { scale: Animated.AnimatedInterpolation<number> }[] = [];

    if (isPlayed) {
      dotBg = isInPentatonic ? '#22c55e' : colors.sharp;
      dotBorder = isInPentatonic ? '#16a34a' : colors.sharp;
      dotTextColor = '#fff';
      dotBorderWidth = 2.5;
      dotOpacity = pulseAnim;
      dotTransform = [{
        scale: pulseAnim.interpolate({
          inputRange: [0.45, 1],
          outputRange: [1, 1.22],
        }),
      }];
    }

    noteDot = (
      <Animated.View
        style={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: DOT_SIZE / 2,
          backgroundColor: dotBg,
          borderWidth: dotBorderWidth,
          borderColor: dotBorder,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
          opacity: dotOpacity,
          transform: dotTransform,
        }}
      >
        <Text
          style={{
            color: dotTextColor,
            fontSize: note.noteName.length > 2 ? 7 : 9,
            fontWeight: 'bold',
            fontFamily: 'monospace',
          }}
        >
          {note.noteName}
        </Text>
      </Animated.View>
    );
  }

  return (
    <View
      key={f}
      style={{
        width: FRET_WIDTH,
        height: STRING_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        borderLeftWidth: isNut ? 3 : 1,
        borderLeftColor: isNut ? colors.text : colors.buttonBorder,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 1.5,
          backgroundColor: colors.buttonBorder,
          opacity: 0.8,
        }}
      />
      {noteDot}
    </View>
  );
}

function renderByFretCell(params: {
  f: number;
  sIdx: number;
  qStringIdx: number;
  questionFret: number;
  isRevealed: boolean;
  answeredCorrectly: boolean;
  correctNote: string;
  colors: any;
  cellW: number;
  cellH: number;
}): React.ReactNode {
  const {
    f,
    sIdx,
    qStringIdx,
    questionFret,
    isRevealed,
    answeredCorrectly,
    correctNote,
    colors,
    cellW,
    cellH,
  } = params;

  const isQuestion = sIdx === qStringIdx && f === questionFret;
  let thickness = 1;
  if (sIdx >= 3) {
    thickness = sIdx === 5 ? 2.5 : 2;
  }

  let questionBg = 'transparent';
  if (isQuestion && isRevealed) {
    questionBg = answeredCorrectly ? colors.inTune + '22' : colors.sharp + '22';
  }

  let questionDotBg = colors.primary;
  if (isRevealed) {
    questionDotBg = answeredCorrectly ? colors.inTune : colors.sharp;
  }

  return (
    <View
      key={f}
      style={{
        width: cellW,
        height: cellH,
        borderLeftWidth: f === 0 ? 4 : 0,
        borderLeftColor: colors.text,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: questionBg,
      }}
    >
      {f > 0 && (
        <View style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 1, backgroundColor: colors.buttonBorder + '66' }} />
      )}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: cellH / 2 - thickness / 2,
          height: thickness,
          backgroundColor: colors.textSecondary + '55',
        }}
      />
      {isQuestion && (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: questionDotBg,
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isRevealed ? 0 : 0.5,
            shadowRadius: 4,
            elevation: isRevealed ? 0 : 4,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: isRevealed ? 10 : 18 }}>
            {isRevealed ? correctNote : '?'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────
export default function ScalesScreen() {
  const { settings, getThemeColors } = useSettings();
  const colors = getThemeColors();

  // Estado de selección
  const [rootNote, setRootNote] = useState('A');
  const [modeKey, setModeKey] = useState('ionian');
  const [showModeGuide, setShowModeGuide] = useState(false);
  const [selectedChordIdx, setSelectedChordIdx] = useState(0);
  const [practiceType, setPracticeType] = useState<'modes' | 'pentatonics'>('modes');
  const practiceTypeRef = useRef<'modes' | 'pentatonics'>('modes');

  // Estado de audio / detección
  const [isListening, setIsListening] = useState(true);
  const [detectionData, setDetectionData] = useState<{
    frequency: number | null;
    actualNote: string | null;
  }>({ frequency: null, actualNote: null });
  const isFocusedRef = useRef(false);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInScaleRef = useRef(false);

  // ── Estado del modo Quiz ─────────────────────────────────────────────────
  // ── screenMode persisted in AsyncStorage ───────────────────────────────
  const [screenMode, setScreenMode] = useState<'practice' | 'guide' | 'quiz'>('practice');
  const screenModeRef = useRef<'practice' | 'guide' | 'quiz'>('practice');

  // Load last mode on mount
  useEffect(() => {
    loadPracticePersistedState().then((state) => {
      if (state.screenMode) {
        setScreenMode(state.screenMode);
        screenModeRef.current = state.screenMode;
      }
      if (state.rootNote) setRootNote(state.rootNote);
      if (state.modeKey) setModeKey(state.modeKey);
      if (state.practiceType) setPracticeType(state.practiceType);
      if (state.fretboardPositionStats) setFretboardPositionStats(state.fretboardPositionStats);
      if (state.fretboardAttemptLog) setFretboardAttemptLog(state.fretboardAttemptLog as FretboardAttemptRow[]);
    }).catch(() => {});
  }, []);

  // Persist whenever screenMode, rootNote or modeKey changes
  useEffect(() => {
    savePracticeScreenMode(screenMode).catch(() => {});
  }, [screenMode]);
  useEffect(() => {
    savePracticeRootNote(rootNote).catch(() => {});
  }, [rootNote]);
  useEffect(() => {
    savePracticeModeKey(modeKey).catch(() => {});
  }, [modeKey]);
  useEffect(() => {
    savePracticeType(practiceType).catch(() => {});
  }, [practiceType]);

  // challenge: el reto actual
  const [challenge, setChallenge] = useState<ChallengeType | null>(null);
  const challengeRef = useRef<ChallengeType | null>(null);

  // quizStatus: estado del ciclo de cada reto
  const [quizStatus, setQuizStatus] = useState<'waiting' | 'correct' | 'wrong'>('waiting');
  const quizStatusRef = useRef<'waiting' | 'correct' | 'wrong'>('waiting');

  const [streak, setStreak] = useState(0);           // racha de aciertos
  const hasEvaluatedRef = useRef(false);             // evita evaluar la misma nota dos veces
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingFreshQuizInputRef = useRef(false);
  const previousQuizNoteIdxRef = useRef<number | null>(null);
  const quizDebounceCountRef = useRef(0);            // consecutive stable detections before scoring
  const QUIZ_DEBOUNCE_FRAMES = 3;                    // ~75 ms at 25 ms interval

  // ── Estado del Fretboard Quiz (sin guitarra) ──────────────────────────────
  const [fretboardQ, setFretboardQ] = useState<FretboardQ | null>(null);
  const [fretboardAnswer, setFretboardAnswer] = useState<string | null>(null);
  const [fretboardScore, setFretboardScore] = useState({ correct: 0, total: 0 });
  const [fretboardDifficulty, setFretboardDifficulty] = useState<FretboardDifficulty>('medium');
  const fretboardDifficultyRef = useRef<FretboardDifficulty>('medium');
  const fretboardAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fretboardStartRef = useRef<number>(Date.now());
  const [fretboardMode, setFretboardMode] = useState<FretboardMode>('single');
  const [fretboardPositionStats, setFretboardPositionStats] = useState<Record<string, FretboardPositionStats>>({});
  const [byFretRound, setByFretRound] = useState<ByFretRound>(makeByFretRound());
  const [byFretDifficulty, setByFretDifficulty] = useState<FretboardDifficulty>('medium');
  const [byFretStarted, setByFretStarted] = useState(false);
  const [byFretCountdown, setByFretCountdown] = useState<number | null>(null);
  const [byFretFeedback, setByFretFeedback] = useState<{ type: 'idle' | 'ok' | 'bad'; text: string }>({
    type: 'idle',
    text: '',
  });
  const [fretboardAttemptLog, setFretboardAttemptLog] = useState<FretboardAttemptRow[]>([]);
  const byFretCountdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    savePracticeFretboardPositionStats(fretboardPositionStats).catch(() => {});
  }, [fretboardPositionStats]);
  useEffect(() => {
    savePracticeFretboardAttemptLog(fretboardAttemptLog).catch(() => {});
  }, [fretboardAttemptLog]);

  // ── Sub-modo del Quiz ─────────────────────────────────────────────────────
  const [quizSubMode, setQuizSubMode] = useState<'fretboard' | 'guitar'>('fretboard');
  const quizSubModeRef = useRef<'fretboard' | 'guitar'>('fretboard');

  // ── PanResponder para deslizar el modo (ciclo de escala padre) ────────────
  const swipeHandled = useRef(false);
  const modePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5,
      onPanResponderGrant: () => { swipeHandled.current = false; },
      onPanResponderMove: (_, gestureState) => {
        if (swipeHandled.current) return;
        if (Math.abs(gestureState.dx) > 40) {
          swipeHandled.current = true;
          // Will call the setter via a ref
          (modePanResponder as any)._onSwipe?.(gestureState.dx > 0 ? -1 : 1);
        }
      },
      onPanResponderRelease: () => { swipeHandled.current = false; },
    })
  ).current;

  // Refs para rootNote/modeKey: evitan closures obsoletos en el callback de audio
  const rootNoteRef = useRef(rootNote);
  const modeKeyRef = useRef(modeKey);

  // ── Estado modo Guide ────────────────────────────────────────────────────
  const [guideDirection, setGuideDirection] = useState<'asc' | 'desc'>('asc');
  const [guidePosition, setGuidePosition] = useState(0);
  const [guideStatus, setGuideStatus] = useState<'waiting' | 'hit' | 'done'>('waiting');
  const [guidePentatonicType, setGuidePentatonicType] = useState<'major' | 'minor'>('minor');
  const guidePositionRef = useRef(0);
  const guideStatusRef = useRef<'waiting' | 'hit' | 'done'>('waiting');
  const guideDirectionRef = useRef<'asc' | 'desc'>('asc');
  const guidePentatonicTypeRef = useRef<'major' | 'minor'>('minor');

  // Datos derivados
  const mode = MODES[modeKey as keyof typeof MODES];
  const scaleNotes = getScaleNotes(rootNote, modeKey);
  const scaleNoteNames = getScaleNoteNames(rootNote, modeKey);
  const pattern = getThreeNotesPerString(rootNote, modeKey);
  const diatonicChords = getDiatonicChords(rootNote, modeKey);
  const parentDisplayRootIdx = (NOTE_CHROMA_MAP[rootNote] - MODE_SEMITONE_OFFSET[modeKey] + 12) % 12;
  const selectedChord = diatonicChords[selectedChordIdx] ?? diatonicChords[0];
  const activePentatonicNoteNames = selectedChord
    ? getPentatonicNoteNames(selectedChord.rootIdx, selectedChord.pentatonicType, parentDisplayRootIdx)
    : [];
  const activePentatonicNoteIndices = activePentatonicNoteNames
    .map((name: string) => NOTE_CHROMA_MAP[name])
    .filter((idx: number | undefined): idx is number => idx !== undefined);
  const activePracticeNoteIndices =
    screenMode === 'practice' && practiceType === 'pentatonics'
      ? activePentatonicNoteIndices
      : scaleNotes;

  const masteredPositionKeys = useMemo(() => {
    return new Set(
      Object.entries(fretboardPositionStats)
        .filter(([, stats]) => Boolean(stats?.mastered))
        .map(([key]) => key)
    );
  }, [fretboardPositionStats]);

  const byFretOptions = useMemo(() => {
    const notes = ALL_STRINGS.map((stringNumber) => getNoteForPosition(stringNumber, byFretRound.fret));
    return notes.sort(() => Math.random() - 0.5);
  }, [byFretRound.fret, byFretRound.roundStartedAt]);

  const byFretTimeLimitMs = BY_FRET_TIME_LIMITS_MS[byFretDifficulty];
  const byFretTimeLimitSec = Math.round(byFretTimeLimitMs / 1000);
  const isByFretCountingDown = byFretCountdown !== null;
  const isByFretAnswering = byFretStarted && !isByFretCountingDown;
  const byFretPrompt = byFretRound.fret === 0 ? 'Open' : String(byFretRound.fret);
  let byFretStatusText = `Choose difficulty and tap Start. Limit: ${byFretTimeLimitSec}s.`;
  if (isByFretCountingDown) {
    byFretStatusText = `Get ready... ${byFretCountdown}`;
  } else if (isByFretAnswering) {
    byFretStatusText = `Clear all 6 strings in ${byFretTimeLimitSec}s or less to unlock next fret.`;
  }
  const byFretInstructionText = isByFretAnswering
    ? `Pick the correct note for String ${STRING_LABELS[byFretRound.currentString - 1]} at fret ${byFretPrompt}.`
    : 'Start the round to answer this fret.';
  const byFretStartButtonText = isByFretCountingDown ? `Starting in ${byFretCountdown}...` : 'Start';
  const byFretButtonsEnabled = isByFretAnswering;

  const spawnGuitarChallenge = useCallback((root: string, mode: string, prevNoteIdx?: number) => {
    const newC = makeChallenge(root, mode, prevNoteIdx);
    setChallenge(newC);
    challengeRef.current = newC;
    setQuizStatus('waiting');
    quizStatusRef.current = 'waiting';
    setDetectionData({ frequency: null, actualNote: null });
    hasEvaluatedRef.current = false;
    awaitingFreshQuizInputRef.current = prevNoteIdx !== undefined;
    previousQuizNoteIdxRef.current = prevNoteIdx ?? null;
    quizDebounceCountRef.current = 0;
  }, []);

  const spawnFretboardQuestion = useCallback((difficulty: FretboardDifficulty) => {
    const newQ = makeFretboardQuestion(difficulty, masteredPositionKeys);
    setFretboardQ(newQ);
    setFretboardAnswer(null);
    fretboardStartRef.current = Date.now();
  }, [masteredPositionKeys]);

  const registerFretboardAttempt = useCallback((
    stringNumber: number,
    fret: number,
    elapsedMs: number,
    isRight: boolean,
    mode: FretboardMode = 'single'
  ) => {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;

    const clampedElapsedMs = Math.min(120000, Math.round(elapsedMs));
    const note = getNoteForPosition(stringNumber, fret);
    const masteredByTime = isRight && clampedElapsedMs < 2000;

    setFretboardAttemptLog((prev) => ([
      ...prev,
      {
        timestamp: Date.now(),
        mode,
        stringNumber,
        fret,
        note,
        responseMs: clampedElapsedMs,
        correct: isRight,
        mastered: masteredByTime,
      },
    ]));

    if (!isRight) return;

    const key = positionKey(stringNumber, fret);
    setFretboardPositionStats((prev) => {
      const prevEntry = prev[key] ?? { attempts: 0, totalMs: 0, mastered: false };
      const attempts = prevEntry.attempts + 1;
      const totalMs = prevEntry.totalMs + clampedElapsedMs;
      const mastered = prevEntry.mastered || masteredByTime;

      return {
        ...prev,
        [key]: { attempts, totalMs, mastered },
      };
    });
  }, []);

  const submitByFretChoice = useCallback((chosenNote: string) => {
    if (!byFretStarted || byFretCountdown !== null) return;

    const chosenChroma = NOTE_CHROMA_MAP[chosenNote] ?? -1;
    const expectedNote = getNoteForPosition(byFretRound.currentString, byFretRound.fret);
    const expectedChroma = NOTE_CHROMA_MAP[expectedNote] ?? -1;
    const elapsedMs = Date.now() - byFretRound.currentStringStartedAt;
    const isRight = chosenChroma === expectedChroma;

    registerFretboardAttempt(byFretRound.currentString, byFretRound.fret, elapsedMs, isRight, 'by-fret');
    setFretboardScore((s) => ({ correct: s.correct + (isRight ? 1 : 0), total: s.total + 1 }));

    if (!isRight) {
      setStreak(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setByFretFeedback({ type: 'bad', text: `Not quite. Try again on this string (${STRING_LABELS[byFretRound.currentString - 1]}).` });
      setByFretRound((prev) => ({ ...prev, currentStringStartedAt: Date.now() }));
      return;
    }

    setStreak((s) => s + 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    if (byFretRound.remainingStrings.length > 0) {
      const nextString = randomFrom(byFretRound.remainingStrings);
      const remainingStrings = byFretRound.remainingStrings.filter((s) => s !== nextString);
      setByFretRound((prev) => ({
        ...prev,
        currentString: nextString,
        remainingStrings,
        currentStringStartedAt: Date.now(),
      }));
      setByFretFeedback({ type: 'ok', text: 'Correct. Next string!' });
      return;
    }

    const roundElapsedMs = Date.now() - byFretRound.roundStartedAt;
    const roundSec = (roundElapsedMs / 1000).toFixed(1);
    const passed = roundElapsedMs <= byFretTimeLimitMs;

    if (passed) {
      setByFretFeedback({ type: 'ok', text: `Great! Fret cleared in ${roundSec}s. Next fret.` });
      setByFretRound(makeByFretRound());
      setByFretStarted(false);
    } else {
      setByFretFeedback({ type: 'bad', text: `Too slow (${roundSec}s). Repeat this fret (<= ${byFretTimeLimitSec}s).` });
      setByFretRound(makeByFretRound(byFretRound.fret));
      setByFretStarted(false);
    }
  }, [byFretCountdown, byFretRound, byFretStarted, byFretTimeLimitMs, byFretTimeLimitSec, registerFretboardAttempt]);

  const startByFretCountdown = useCallback(() => {
    if (byFretCountdownRef.current) clearTimeout(byFretCountdownRef.current);
    setByFretStarted(false);
    setByFretFeedback({ type: 'idle', text: '' });
    setByFretCountdown(3);
  }, []);

  // ── Ref para ciclar modos (evita closures obsoletos en PanResponder) ──────
  const cycleParentModeRef = useRef<(dir: 1 | -1) => void>(() => {});
  cycleParentModeRef.current = (dir: 1 | -1) => {
    const { root, mode: nextMode } = getAdjacentParentMode(rootNote, modeKey, dir);
    setRootNote(root);
    rootNoteRef.current = root;
    setModeKey(nextMode);
    modeKeyRef.current = nextMode;
  };
  // Inyectar callback al PanResponder (se actualiza en cada render)
  (modePanResponder as any)._onSwipe = (dir: 1 | -1) => cycleParentModeRef.current(dir);

  // Secuencia del modo Guide (recalculada cuando cambia root/modo/dirección)
  const guideSequence = practiceType === 'pentatonics'
    ? buildPentatonicGuideSequence(rootNote, guidePentatonicType, guideDirection)
    : buildGuideSequence(rootNote, modeKey, guideDirection);
  const currentGuideNote = guideSequence[guidePosition] ?? guideSequence[0];

  // ── Audio setup (igual que el tuner) ────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        shouldPlayInBackground: false,
        interruptionMode: 'doNotMix',
        shouldRouteThroughEarpiece: false,
      }).catch((e) => logger.error('Audio setup error:', e));
      setIsListening(true);
      isFocusedRef.current = true;

      return () => {
        setIsListening(false);
        isFocusedRef.current = false;
      };
    }, [])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (!isFocusedRef.current) return;
      // On Android, "inactive" can fire during UI transitions and causes
      // unnecessary recorder restarts.
      const shouldPause = Platform.OS === 'android'
        ? nextState === 'background'
        : nextState === 'background' || nextState === 'inactive';
      if (shouldPause) {
        setIsListening(false);
      } else if (nextState === 'active') {
        setIsListening(true);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    return () => {
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      if (byFretCountdownRef.current) clearTimeout(byFretCountdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (byFretCountdown == null) return;

    byFretCountdownRef.current = setTimeout(() => {
      if (byFretCountdown > 1) {
        setByFretCountdown(byFretCountdown - 1);
        return;
      }

      const now = Date.now();
      setByFretRound((prev) => ({
        ...prev,
        roundStartedAt: now,
        currentStringStartedAt: now,
      }));
      setByFretCountdown(null);
      setByFretStarted(true);
    }, 1000);

    return () => {
      if (byFretCountdownRef.current) clearTimeout(byFretCountdownRef.current);
    };
  }, [byFretCountdown]);

  // Sincronizar refs con el estado
  useEffect(() => { screenModeRef.current = screenMode; }, [screenMode]);
  useEffect(() => { challengeRef.current = challenge; }, [challenge]);
  useEffect(() => { quizStatusRef.current = quizStatus; }, [quizStatus]);
  useEffect(() => { rootNoteRef.current = rootNote; }, [rootNote]);
  useEffect(() => { modeKeyRef.current = modeKey; }, [modeKey]);
  useEffect(() => { guidePositionRef.current = guidePosition; }, [guidePosition]);
  useEffect(() => { guideStatusRef.current = guideStatus; }, [guideStatus]);
  useEffect(() => { guideDirectionRef.current = guideDirection; }, [guideDirection]);
  useEffect(() => { guidePentatonicTypeRef.current = guidePentatonicType; }, [guidePentatonicType]);
  useEffect(() => { practiceTypeRef.current = practiceType; }, [practiceType]);
  // Cuando cambian root/mode en modo quiz, regenerar reto
  useEffect(() => {
    if (screenModeRef.current === 'quiz') {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      spawnGuitarChallenge(rootNote, modeKey);
    }
    // En modo guide, reiniciar desde la primera nota
    if (screenModeRef.current === 'guide') {
      setGuidePosition(0);
      guidePositionRef.current = 0;
      setGuideStatus('waiting');
      guideStatusRef.current = 'waiting';
      hasEvaluatedRef.current = false;
    }
  }, [rootNote, modeKey, spawnGuitarChallenge]);

  // Reiniciar posición al cambiar dirección, tipo de pentatónica o tipo de práctica en guide
  useEffect(() => {
    setGuidePosition(0);
    guidePositionRef.current = 0;
    setGuideStatus('waiting');
    guideStatusRef.current = 'waiting';
    hasEvaluatedRef.current = false;
  }, [guideDirection, guidePentatonicType, practiceType]);

  // ── Inicializar fretboard quiz al entrar en modo quiz ─────────────────────
  useEffect(() => {
    if (screenMode === 'quiz') {
      if (fretboardAdvanceRef.current) clearTimeout(fretboardAdvanceRef.current);
      spawnFretboardQuestion(fretboardDifficultyRef.current);
      setFretboardScore({ correct: 0, total: 0 });
      setStreak(0);
    } else if (fretboardAdvanceRef.current) {
      clearTimeout(fretboardAdvanceRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenMode, spawnFretboardQuestion]);

  // ── Callback de detección ────────────────────────────────────────────────
  const handleFrequencyDetected = (data: any) => {
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }

    if (!data.frequency) {
      quizDebounceCountRef.current = 0;
      if (screenModeRef.current === 'quiz' && quizSubModeRef.current === 'guitar') {
        awaitingFreshQuizInputRef.current = false;
      }
      clearTimeoutRef.current = setTimeout(() => {
        setDetectionData({ frequency: null, actualNote: null });
        lastInScaleRef.current = false;
        // En quiz: si estaba en estado 'wrong', resetear para permitir nuevo intento
        if (screenModeRef.current === 'quiz' && quizStatusRef.current === 'wrong') {
          setQuizStatus('waiting');
          quizStatusRef.current = 'waiting';
          hasEvaluatedRef.current = false;
        }
        // En guide: al soltar la cuerda, resetear para poder reintentar
        if (screenModeRef.current === 'guide' && guideStatusRef.current === 'waiting') {
          hasEvaluatedRef.current = false;
        }
      }, 250);
      return;
    }

    // ── Modo Practice: feedback de escala ───────────────────────────────────
    if (screenModeRef.current === 'practice') {
      const { inScale } = getScaleInfo(data.frequency, scaleNotes, settings.referencePitch);
      if (inScale && !lastInScaleRef.current) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      lastInScaleRef.current = inScale;
    }

    const detectedNoteIdx = data.actualNote == null
      ? -1
      : (NOTE_CHROMA_MAP[data.actualNote] ?? -1);

    if (
      screenModeRef.current === 'quiz' &&
      quizSubModeRef.current === 'guitar' &&
      awaitingFreshQuizInputRef.current
    ) {
      if (detectedNoteIdx !== -1 && detectedNoteIdx !== previousQuizNoteIdxRef.current) {
        awaitingFreshQuizInputRef.current = false;
        quizDebounceCountRef.current = 0;
      } else {
        return;
      }
    }

    // ── Quiz modo Guitar (micrófono): evaluar nota con debounce ──────────────
    if (
      screenModeRef.current === 'quiz' &&
      quizSubModeRef.current === 'guitar' &&
      quizStatusRef.current === 'waiting' &&
      challengeRef.current &&
      !hasEvaluatedRef.current
    ) {
      const { inScale: isCorrect } = getScaleInfo(
        data.frequency,
        [challengeRef.current.noteIdx],
        settings.referencePitch
      );
      if (isCorrect) {
        quizDebounceCountRef.current += 1;
        if (quizDebounceCountRef.current >= QUIZ_DEBOUNCE_FRAMES) {
          hasEvaluatedRef.current = true;
          quizDebounceCountRef.current = 0;
          setQuizStatus('correct');
          quizStatusRef.current = 'correct';
          setStreak((s) => s + 1);
          previousQuizNoteIdxRef.current = challengeRef.current.noteIdx;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          autoAdvanceRef.current = setTimeout(() => {
            spawnGuitarChallenge(rootNoteRef.current, modeKeyRef.current, challengeRef.current?.noteIdx);
          }, 600);
        }
      } else {
        quizDebounceCountRef.current -= 1;
        if (quizDebounceCountRef.current <= -QUIZ_DEBOUNCE_FRAMES) {
          hasEvaluatedRef.current = true;
          quizDebounceCountRef.current = 0;
          setQuizStatus('wrong');
          quizStatusRef.current = 'wrong';
          setStreak(0);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        }
      }
    }

    // ── Modo Guide: avanzar al tocar la nota correcta ────────────────────────
    if (
      screenModeRef.current === 'guide' &&
      guideStatusRef.current === 'waiting' &&
      !hasEvaluatedRef.current
    ) {
      const seq = practiceTypeRef.current === 'pentatonics'
        ? buildPentatonicGuideSequence(rootNoteRef.current, guidePentatonicTypeRef.current, guideDirectionRef.current)
        : buildGuideSequence(rootNoteRef.current, modeKeyRef.current, guideDirectionRef.current);
      const pos = guidePositionRef.current;
      if (pos < seq.length) {
        const { inScale: isHit } = getScaleInfo(
          data.frequency,
          [seq[pos].noteIdx],
          settings.referencePitch
        );
        if (isHit) {
          hasEvaluatedRef.current = true;
          setGuideStatus('hit');
          guideStatusRef.current = 'hit';
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          setTimeout(() => {
            const nextPos = pos + 1;
            if (nextPos >= seq.length) {
              setGuideStatus('done');
              guideStatusRef.current = 'done';
              setGuidePosition(nextPos);
              guidePositionRef.current = nextPos;
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            } else {
              setGuidePosition(nextPos);
              guidePositionRef.current = nextPos;
              setGuideStatus('waiting');
              guideStatusRef.current = 'waiting';
            }
            hasEvaluatedRef.current = false;
          }, 400);
        }
      }
    }

    setDetectionData({ frequency: data.frequency, actualNote: data.actualNote });
  };

  // ── Análisis de la nota detectada (con tolerancia de ±50 cents) ─────────
  const { inScale: detectedInScale, degreeIdx: detectedDegree } = detectionData.frequency
    ? getScaleInfo(detectionData.frequency, activePracticeNoteIndices, settings.referencePitch)
    : { inScale: false, degreeIdx: -1 };

  // ── Índice cromático de la nota detectada (para iluminar el mástil) ──────
  const playedNoteIdx = detectionData.actualNote == null
    ? -1
    : (NOTE_CHROMA_MAP[detectionData.actualNote] ?? -1);

  // ── Animación de pulso para la nota activa ────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (screenMode !== 'practice') {
      pulseAnimRef.current?.stop();
      pulseAnim.setValue(1);
      return;
    }
    if (detectionData.frequency) {
      pulseAnimRef.current?.stop();
      pulseAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.45, duration: 320, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
        ])
      );
      pulseAnimRef.current.start();
    } else {
      pulseAnimRef.current?.stop();
      pulseAnimRef.current = null;
      pulseAnim.setValue(1);
    }
  }, [detectionData.frequency, screenMode]);

  // ── Datos del mástil ─────────────────────────────────────────────────────
  // Orden de display: cuerda 1 (high e) arriba → invertir array
  const displayPattern = [...pattern].reverse();
  const allFrets = pattern.flatMap((s) => s.notes.map((n: any) => n.fret));
  const minFret = Math.max(0, Math.min(...allFrets) - 1);
  const maxFret = Math.max(...allFrets) + 1;
  const fretRange = Array.from({ length: maxFret - minFret + 1 }, (_, i) => minFret + i);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

        {/* ── Cabecera ── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primary }]}>PRACTICE</Text>
        </View>

        {/* ── Toggle Practice / Guide / Quiz ── */}
        <View style={[styles.modeToggle, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, screenMode === 'practice' && { backgroundColor: colors.primary }]}
            onPress={() => setScreenMode('practice')}
          >
            <Text style={[styles.toggleText, { color: screenMode === 'practice' ? colors.textOnPrimary : colors.textSecondary }]}>
              Scales
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, screenMode === 'guide' && { backgroundColor: colors.primary }]}
            onPress={() => {
              if (screenMode !== 'guide') {
                setGuidePosition(0);
                guidePositionRef.current = 0;
                setGuideStatus('waiting');
                guideStatusRef.current = 'waiting';
                hasEvaluatedRef.current = false;
              }
              setScreenMode('guide');
              screenModeRef.current = 'guide';
            }}
          >
            <Text style={[styles.toggleText, { color: screenMode === 'guide' ? colors.textOnPrimary : colors.textSecondary }]}>
              Guide
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, screenMode === 'quiz' && { backgroundColor: colors.primary }]}
            onPress={() => {
              if (screenMode !== 'quiz') {
                if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
                spawnGuitarChallenge(rootNote, modeKey);
                setStreak(0);
              }
              setScreenMode('quiz');
              screenModeRef.current = 'quiz';
            }}
          >
            <Text style={[styles.toggleText, { color: screenMode === 'quiz' ? colors.textOnPrimary : colors.textSecondary }]}>
              Quiz
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Selectores: Root + Modo (ocultos en Quiz) ── */}
        {screenMode !== 'quiz' && (
        <View style={styles.selectorsRow}>
          {/* Root */}
          <View style={styles.selectorCol}>
            <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>ROOT</Text>
            <View style={styles.cycler}>
              <TouchableOpacity
                style={styles.chevronBtn}
                onPress={() => setRootNote(cyclePrev(ROOT_NOTES, rootNote))}
              >
                <Text style={[styles.chevronText, { color: colors.primary }]}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.cyclerValue, { color: colors.text }]}>
                {getRootNoteDisplay(rootNote, modeKey)}
              </Text>
              <TouchableOpacity
                style={styles.chevronBtn}
                onPress={() => setRootNote(cycleNext(ROOT_NOTES, rootNote))}
              >
                <Text style={[styles.chevronText, { color: colors.primary }]}>›</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Modo */}
          <View style={styles.selectorCol}>
            <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>MODE</Text>
            <View style={styles.cycler}>
              <TouchableOpacity
                style={styles.chevronBtn}
                onPress={() => setModeKey(cyclePrev(MODE_KEYS, modeKey))}
              >
                <Text style={[styles.chevronText, { color: colors.primary }]}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.cyclerValue, { color: colors.text }]}>
                {mode.name}
              </Text>
              <TouchableOpacity
                style={styles.chevronBtn}
                onPress={() => setModeKey(cycleNext(MODE_KEYS, modeKey))}
              >
                <Text style={[styles.chevronText, { color: colors.primary }]}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        )}

        {/* ── Tarjeta de info del modo (oculta en Quiz) ── */}
        {screenMode !== 'quiz' && (
        <View
          style={[styles.modeCard, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}
          {...modePanResponder.panHandlers}
        >
          <Text style={[styles.modeTitle, { color: colors.primary }]}>
            {mode.emoji}  {getRootNoteDisplay(rootNote, modeKey)} {mode.name}
            <Text style={[styles.modeDegree, { color: colors.textSecondary }]}>
              {'  '}(Degree {mode.degree})
            </Text>
          </Text>
          <Text style={[styles.modeCharacteristic, { color: colors.textSecondary }]}>
            {mode.characteristic}
          </Text>
          <View style={styles.noteChips}>
            {scaleNoteNames.map((noteName: string) => (
              <View
                key={noteName}
                style={[
                  styles.noteChip,
                  {
                    backgroundColor: noteName === scaleNoteNames[0] ? colors.primary : colors.buttonBg,
                    borderColor: noteName === scaleNoteNames[0] ? colors.primaryBorder : colors.buttonBorder,
                  },
                ]}
              >
                <Text style={[
                  styles.noteChipText,
                  { color: noteName === scaleNoteNames[0] ? colors.textOnPrimary : colors.text },
                ]}>
                  {noteName}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 6, letterSpacing: 1, fontWeight: '500' }}>
            ‹  swipe to change mode  ›
          </Text>
        </View>
        )}

        {/* ── Sub-toggle: Modes / Pentatonics (oculto en Quiz) ── */}
        {screenMode !== 'quiz' && (
        <View style={[styles.modeToggle, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder, marginTop: 6 }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, practiceType === 'modes' && { backgroundColor: colors.primary }]}
            onPress={() => setPracticeType('modes')}
          >
            <Text style={[styles.toggleText, { color: practiceType === 'modes' ? colors.textOnPrimary : colors.textSecondary }]}>
              Modes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, practiceType === 'pentatonics' && { backgroundColor: colors.primary }]}
            onPress={() => setPracticeType('pentatonics')}
          >
            <Text style={[styles.toggleText, { color: practiceType === 'pentatonics' ? colors.textOnPrimary : colors.textSecondary }]}>
              Pentatonics
            </Text>
          </TouchableOpacity>
        </View>
        )}

        {/* ── What are modes / pentatonics? (oculto en Quiz) ── */}
        {screenMode !== 'quiz' && (<>
        <TouchableOpacity
          style={[styles.modeGuideToggle, { borderColor: colors.buttonBorder }]}
          onPress={() => setShowModeGuide(v => !v)}
        >
          <Text style={[styles.modeGuideToggleText, { color: colors.textSecondary }]}>
            ℹ  {practiceType === 'pentatonics' ? 'What are pentatonics?' : 'What are modes?'}
          </Text>
          <Text style={[styles.modeGuideToggleText, { color: colors.textSecondary }]}>
            {showModeGuide ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>

        {showModeGuide && (
          <View style={[styles.modeGuidePanel, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}>
            {practiceType === 'pentatonics' ? (
              <>
                <Text style={[styles.modeGuideLead, { color: colors.text }]}>
                  Pentatonic scales use 5 notes instead of 7, removing the most dissonant intervals. Every note works over the underlying chord, making them ideal for improvisation.
                </Text>
                {Object.entries(PENTATONIC_INFO).map(([key, p]) => (
                  <View
                    key={key}
                    style={[
                      styles.modeGuideRow,
                      key === guidePentatonicType && { backgroundColor: colors.primary + '18', borderRadius: 8 },
                    ]}
                  >
                    <Text style={[styles.modeGuideEmoji]}>{p.emoji}</Text>
                    <View style={styles.modeGuideRowText}>
                      <Text style={[styles.modeGuideRowTitle, { color: key === guidePentatonicType ? colors.primary : colors.text }]}>
                        {p.name}{'  '}
                        <Text style={[styles.modeGuideRowDegree, { color: colors.textSecondary }]}>
                          ({p.intervals})
                        </Text>
                      </Text>
                      <Text style={[styles.modeGuideRowDesc, { color: colors.textSecondary }]}>
                        {p.description}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <>
                <Text style={[styles.modeGuideLead, { color: colors.text }]}>
                  Modes are 7 scales derived from the major scale, each starting on a different degree.
                  They share the same notes as their parent scale but with a different root, creating a completely different sound.
                </Text>
                <Text style={[styles.modeGuideKey, { color: colors.primary, borderColor: colors.buttonBorder }]}>
                  Key insight: A Ionian and A Dorian are different scales — same root, different notes. But C Ionian and D Dorian share the same notes (both belong to C major).
                </Text>
                {Object.entries(MODES).map(([key, m]) => (
                  <View
                    key={key}
                    style={[
                      styles.modeGuideRow,
                      key === modeKey && { backgroundColor: colors.primary + '18', borderRadius: 8 },
                    ]}
                  >
                    <Text style={[styles.modeGuideEmoji]}>{m.emoji}</Text>
                    <View style={styles.modeGuideRowText}>
                      <Text style={[styles.modeGuideRowTitle, { color: key === modeKey ? colors.primary : colors.text }]}>
                        {m.name}{'  '}
                        <Text style={[styles.modeGuideRowDegree, { color: colors.textSecondary }]}>
                          ({m.altName})
                        </Text>
                      </Text>
                      <Text style={[styles.modeGuideRowDesc, { color: colors.textSecondary }]}>
                        {(m as any).description}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
        </>)}
        {/* ══════════ MODO PRACTICE ══════════ */}
        {screenMode === 'practice' && (<>

        {/* ── Contenido Modes ── */}
        {practiceType === 'modes' && (<>

        {/* ── Sección: 3 notas por cuerda ── */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionLine, { backgroundColor: colors.buttonBorder }]} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            3 NOTES PER STRING
          </Text>
          <View style={[styles.sectionLine, { backgroundColor: colors.buttonBorder }]} />
        </View>

        {/* ── Diagrama de mástil ── */}
        <View style={styles.fretboard}>
          {/* Números de traste */}
          <View style={{ flexDirection: 'row', marginBottom: 3 }}>
            <View style={{ width: LABEL_WIDTH }} />
            {fretRange.map((f) => (
              <View key={f} style={{ width: FRET_WIDTH, alignItems: 'center' }}>
                <Text style={[styles.fretNum, { color: colors.textSecondary }]}>
                  {f === 0 ? '○' : f}
                </Text>
              </View>
            ))}
          </View>

          {/* Filas de cuerdas */}
          {displayPattern.map((string: any, displayIdx: number) => (
            <View
              key={string.stringNumber}
              style={{ flexDirection: 'row', alignItems: 'center', height: STRING_HEIGHT }}
            >
              {/* Etiqueta de cuerda */}
              <View style={{ width: LABEL_WIDTH, alignItems: 'center' }}>
                <Text style={[styles.stringLabel, { color: colors.textSecondary }]}>
                  {STRING_LABELS[displayIdx]}
                </Text>
              </View>

              {/* Celdas de traste */}
              {fretRange.map((f) => {
                const note = string.notes.find((n: any) => n.fret === f);
                return renderModeFretCell({
                  f,
                  note,
                  colors,
                  playedNoteIdx,
                  detectedInScale,
                  pulseAnim,
                });
              })}
            </View>
          ))}

          {/* Marcadores de posición (3, 5, 7, 9, 12) */}
          <View style={{ flexDirection: 'row', marginTop: 5 }}>
            <View style={{ width: LABEL_WIDTH }} />
            {fretRange.map((f) => (
              <View key={f} style={{ width: FRET_WIDTH, alignItems: 'center' }}>
                {[3, 5, 7, 9, 12].includes(f) ? (
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 2.5,
                      backgroundColor: colors.textSecondary,
                      opacity: 0.4,
                    }}
                  />
                ) : null}
              </View>
            ))}
          </View>
        </View>

        </>)}
        {/* ── Fin contenido Modes ── */}

        {/* ── Contenido Pentatonics ── */}
        {practiceType === 'pentatonics' && (<>

        {/* ── Sección: Pentatónica por Acorde ── */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionLine, { backgroundColor: colors.buttonBorder }]} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            CHORD PENTATONICS
          </Text>
          <View style={[styles.sectionLine, { backgroundColor: colors.buttonBorder }]} />
        </View>

        {/* Chord chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 6, marginBottom: 8 }}>
          {diatonicChords.map((chord: any) => (
            <TouchableOpacity
              key={`${chord.degree}-${chord.roman}-${chord.name}`}
              onPress={() => {
                const chordIndex = diatonicChords.findIndex((c: any) => c.degree === chord.degree && c.name === chord.name);
                if (chordIndex >= 0) setSelectedChordIdx(chordIndex);
              }}
              style={[
                styles.noteChip,
                {
                  backgroundColor: selectedChordIdx === diatonicChords.findIndex((c: any) => c.degree === chord.degree && c.name === chord.name)
                    ? colors.primary
                    : colors.buttonBg,
                  borderColor: selectedChordIdx === diatonicChords.findIndex((c: any) => c.degree === chord.degree && c.name === chord.name)
                    ? colors.primaryBorder
                    : colors.buttonBorder,
                },
              ]}
            >
              <Text style={[
                styles.noteChipText,
                {
                  color: selectedChordIdx === diatonicChords.findIndex((c: any) => c.degree === chord.degree && c.name === chord.name)
                    ? colors.textOnPrimary
                    : colors.text,
                },
              ]}>
                {chord.roman}{'\u00B7'}{chord.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Selected chord pentatonic info + fretboard */}
        {(() => {
          const chord = selectedChord;
          const pentPattern = getPentatonicPattern(chord.rootIdx, chord.pentatonicType, parentDisplayRootIdx);
          const pentNoteNames = getPentatonicNoteNames(chord.rootIdx, chord.pentatonicType, parentDisplayRootIdx);
          const pentNoteIdxSet = new Set<number>(
            pentNoteNames
              .map((name: string) => NOTE_CHROMA_MAP[name])
              .filter((idx: number | undefined): idx is number => idx !== undefined)
          );
          const pentDisplay = [...pentPattern].reverse();
          const pentFrets = pentPattern.flatMap((s: any) => s.notes.map((n: any) => n.fret));
          const pentMinFret = Math.max(0, Math.min(...pentFrets) - 1);
          const pentMaxFret = Math.max(...pentFrets) + 1;
          const pentFretRange = Array.from({ length: pentMaxFret - pentMinFret + 1 }, (_, i) => pentMinFret + i);

          return (
            <>
              <View style={[styles.modeCard, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}>
                <Text style={[styles.modeTitle, { color: colors.primary }]}>
                  {chord.name} {'\u2192'} {chord.pentatonicLabel}
                </Text>
                <View style={styles.noteChips}>
                  {pentNoteNames.map((name: string) => (
                    <View
                      key={name}
                      style={[
                        styles.noteChip,
                        {
                          backgroundColor: name === pentNoteNames[0] ? colors.primary : colors.buttonBg,
                          borderColor: name === pentNoteNames[0] ? colors.primaryBorder : colors.buttonBorder,
                        },
                      ]}
                    >
                      <Text style={[
                        styles.noteChipText,
                        { color: name === pentNoteNames[0] ? colors.textOnPrimary : colors.text },
                      ]}>
                        {name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Pentatonic fretboard */}
              <View style={styles.fretboard}>
                <View style={{ flexDirection: 'row', marginBottom: 3 }}>
                  <View style={{ width: LABEL_WIDTH }} />
                  {pentFretRange.map((f) => (
                    <View key={f} style={{ width: FRET_WIDTH, alignItems: 'center' }}>
                      <Text style={[styles.fretNum, { color: colors.textSecondary }]}>
                        {f === 0 ? '\u25CB' : f}
                      </Text>
                    </View>
                  ))}
                </View>

                {pentDisplay.map((string: any, displayIdx: number) => (
                  <View
                    key={string.stringNumber}
                    style={{ flexDirection: 'row', alignItems: 'center', height: STRING_HEIGHT }}
                  >
                    <View style={{ width: LABEL_WIDTH, alignItems: 'center' }}>
                      <Text style={[styles.stringLabel, { color: colors.textSecondary }]}>
                        {STRING_LABELS[displayIdx]}
                      </Text>
                    </View>
                    {pentFretRange.map((f) => {
                      const note = string.notes.find((n: any) => n.fret === f);
                      return renderPentatonicFretCell({
                        f,
                        note,
                        colors,
                        playedNoteIdx,
                        pentNoteIdxSet,
                        pulseAnim,
                      });
                    })}
                  </View>
                ))}

                <View style={{ flexDirection: 'row', marginTop: 5 }}>
                  <View style={{ width: LABEL_WIDTH }} />
                  {pentFretRange.map((f) => (
                    <View key={f} style={{ width: FRET_WIDTH, alignItems: 'center' }}>
                      {[3, 5, 7, 9, 12].includes(f) ? (
                        <View
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 2.5,
                            backgroundColor: colors.textSecondary,
                            opacity: 0.4,
                          }}
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            </>
          );
        })()}

        </>)}
        {/* ── Fin contenido Pentatonics ── */}

        {/* ── Sección: Detector en vivo ── */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionLine, { backgroundColor: colors.buttonBorder }]} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DETECTING</Text>
          <View style={[styles.sectionLine, { backgroundColor: colors.buttonBorder }]} />
        </View>

        <View style={[styles.detector, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}>
          {detectionData.frequency ? (
            <>
              <Text
                style={{
                  color: detectedInScale ? colors.primary : colors.sharp,
                  fontSize: 62,
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  lineHeight: 70,
                  letterSpacing: 1,
                }}
              >
                {detectionData.actualNote}
              </Text>
              <Animated.View
                style={[
                  styles.detectorBadge,
                  {
                    backgroundColor: detectedInScale
                      ? colors.primary + '22'
                      : colors.sharp + '22',
                    borderColor: detectedInScale ? colors.primary : colors.sharp,
                    opacity: detectedInScale ? 1 : pulseAnim,
                  },
                ]}
              >
                <Text
                  style={{
                    color: detectedInScale ? colors.primary : colors.sharp,
                    fontSize: 13,
                    fontWeight: '700',
                    letterSpacing: 0.5,
                  }}
                >
                  {(() => {
                    if (detectedInScale) {
                      if (practiceType === 'pentatonics') return '✓  In pentatonic';
                      return `✓  In scale  ·  ${DEGREE_NAMES[detectedDegree]} (${ROMAN[detectedDegree]})`;
                    }
                    return practiceType === 'pentatonics' ? '✗  Out of pentatonic' : '✗  Out of scale';
                  })()}
                </Text>
              </Animated.View>
            </>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 14, letterSpacing: 0.5 }}>
              🎸  Play a note…
            </Text>
          )}
        </View>

        <View style={{ height: 24 }} />
        </>)}
        {/* ══════════ FIN PRACTICE ══════════ */}

        {/* ══════════ MODO GUIDE ══════════ */}
        {screenMode === 'guide' && (<>

        {/* ── Toggle dirección ── */}
        <View style={[styles.modeToggle, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder, marginTop: 10 }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, guideDirection === 'asc' && { backgroundColor: colors.primary }]}
            onPress={() => setGuideDirection('asc')}
          >
            <Text style={[styles.toggleText, { color: guideDirection === 'asc' ? colors.textOnPrimary : colors.textSecondary }]}>
              ↑  Ascending
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, guideDirection === 'desc' && { backgroundColor: colors.primary }]}
            onPress={() => setGuideDirection('desc')}
          >
            <Text style={[styles.toggleText, { color: guideDirection === 'desc' ? colors.textOnPrimary : colors.textSecondary }]}>
              ↓  Descending
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Toggle Major / Minor (solo en pentatónicas) ── */}
        {practiceType === 'pentatonics' && (
        <View style={[styles.modeToggle, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder, marginTop: 6 }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, guidePentatonicType === 'major' && { backgroundColor: colors.primary }]}
            onPress={() => setGuidePentatonicType('major')}
          >
            <Text style={[styles.toggleText, { color: guidePentatonicType === 'major' ? colors.textOnPrimary : colors.textSecondary }]}>
              ☀️  Major
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, guidePentatonicType === 'minor' && { backgroundColor: colors.primary }]}
            onPress={() => setGuidePentatonicType('minor')}
          >
            <Text style={[styles.toggleText, { color: guidePentatonicType === 'minor' ? colors.textOnPrimary : colors.textSecondary }]}>
              🌑  Minor
            </Text>
          </TouchableOpacity>
        </View>
        )}

        {/* ── Barra de progreso (18 puntos) ── */}
        <View style={styles.guideProgressRow}>
          {guideSequence.map((guideNote) => {
            const dotIndex = guideSequence.findIndex(
              (note) => note.stringNumber === guideNote.stringNumber
                && note.fret === guideNote.fret
                && note.degree === guideNote.degree
            );
            const isPast = dotIndex < guidePosition;
            const isCurrent = dotIndex === guidePosition && guideStatus !== 'done';
            let dotBg = colors.buttonBg;
            let dotBorder = colors.buttonBorder;
            if (isPast) {
              dotBg = colors.primary;
              dotBorder = colors.primaryBorder;
            } else if (isCurrent) {
              dotBg = colors.flat;
              dotBorder = colors.flatBorder;
            }
            return (
            <View
              key={`${guideNote.stringNumber}-${guideNote.fret}-${guideNote.degree}`}
              style={[
                styles.guideDot,
                {
                  backgroundColor: dotBg,
                  borderColor: dotBorder,
                },
              ]}
            />
            );
          })}
        </View>

        {guideStatus === 'done' ? (
          /* ── Completado ── */
          <View style={[styles.guideCompleteCard, { backgroundColor: colors.secondary, borderColor: colors.inTuneBorder }]}>
            <Text style={styles.guideCompleteEmoji}>🎉</Text>
            <Text style={[styles.guideCompleteTitle, { color: colors.primary }]}>
              Scale complete!
            </Text>
            <Text style={[styles.guideCompleteSub, { color: colors.textSecondary }]}>
              {practiceType === 'pentatonics'
                ? `${getRootNoteDisplay(rootNote, modeKey)} ${PENTATONIC_INFO[guidePentatonicType].name} · ${guideSequence.length} notes`
                : `${getRootNoteDisplay(rootNote, modeKey)} ${mode.name} · ${guideSequence.length} notes`
              }
            </Text>
            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder, marginHorizontal: 0, marginTop: 16, alignSelf: 'stretch' }]}
              onPress={() => {
                setGuidePosition(0);
                guidePositionRef.current = 0;
                setGuideStatus('waiting');
                guideStatusRef.current = 'waiting';
                hasEvaluatedRef.current = false;
              }}
            >
              <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700', letterSpacing: 0.5 }}>
                Repeat  ↺
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ── Nota actual ── */
          <View style={[
            styles.challengeCard,
            {
              backgroundColor: colors.secondary,
              borderColor: guideStatus === 'hit' ? colors.inTuneBorder : colors.buttonBorder,
            },
          ]}>
            <Text style={[styles.challengeLabel, { color: colors.textSecondary }]}>PLAY THIS NOTE</Text>
            <Text style={[styles.challengeNote, { color: guideStatus === 'hit' ? colors.inTune ?? colors.primary : colors.primary }]}>
              {currentGuideNote.noteName}
            </Text>
            <Text style={[styles.challengeDegree, { color: colors.textSecondary }]}>
              {DEGREE_NAMES[currentGuideNote.degree - 1]}{'  ·  '}{ROMAN[currentGuideNote.degree - 1]}
            </Text>
            <View style={styles.hintRow}>
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                {'String  '}
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {STRING_LABELS[currentGuideNote.stringNumber - 1]}
                </Text>
                {'  ·  Fret  '}
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {currentGuideNote.fret === 0 ? 'open' : String(currentGuideNote.fret)}
                </Text>
                {'   '}
                <Text style={{ color: colors.textSecondary }}>
                  ({guidePosition + 1}/{guideSequence.length})
                </Text>
              </Text>
            </View>
          </View>
        )}

        {/* ── Detector en vivo ── */}
        <View style={[
          styles.quizResult,
          {
            backgroundColor: guideStatus === 'hit' ? colors.inTune + '22' : colors.secondary,
            borderColor: guideStatus === 'hit' ? colors.inTuneBorder : colors.buttonBorder,
          },
        ]}>
          {detectionData.frequency ? (
            <>
              <Text style={{
                color: guideStatus === 'hit' ? colors.primary : colors.text,
                fontSize: 56, fontWeight: 'bold', fontFamily: 'monospace', lineHeight: 64,
              }}>
                {detectionData.actualNote}
              </Text>
              <Text style={{
                color: guideStatus === 'hit' ? colors.primary : colors.textSecondary,
                fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textAlign: 'center',
              }}>
                {guideStatus === 'hit' ? '✓  Nice!  Next…' : '…'}
              </Text>
            </>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 14, letterSpacing: 0.5 }}>
              🎸  Play a note…
            </Text>
          )}
        </View>

        <View style={{ height: 24 }} />
        </>)}
        {/* ══════════ FIN GUIDE ══════════ */}

        {/* ══════════ MODO QUIZ ══════════ */}
        {screenMode === 'quiz' && (<>

        {/* ── Sub-toggle: Mástil vs Guitarra ── */}
        <View style={[styles.modeToggle, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder, marginTop: 10 }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, quizSubMode === 'fretboard' && { backgroundColor: colors.primary }]}
            onPress={() => {
              setQuizSubMode('fretboard');
              quizSubModeRef.current = 'fretboard';
              if (fretboardAdvanceRef.current) clearTimeout(fretboardAdvanceRef.current);
              spawnFretboardQuestion(fretboardDifficultyRef.current);
              setFretboardScore({ correct: 0, total: 0 });
              setStreak(0);
            }}
          >
            <Text style={[styles.toggleText, { color: quizSubMode === 'fretboard' ? colors.textOnPrimary : colors.textSecondary }]}>
              🎸  Fretboard
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, quizSubMode === 'guitar' && { backgroundColor: colors.primary }]}
            onPress={() => {
              setQuizSubMode('guitar');
              quizSubModeRef.current = 'guitar';
              if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
              spawnGuitarChallenge(rootNote, modeKey);
              setStreak(0);
            }}
          >
            <Text style={[styles.toggleText, { color: quizSubMode === 'guitar' ? colors.textOnPrimary : colors.textSecondary }]}>
              🎤  Guitar
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Encabezado: puntuación + racha ── */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8, marginTop: 8 }}>
          {(() => {
            if (quizSubMode === 'fretboard') {
              if (fretboardMode === 'single') {
                return (
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
                    {fretboardScore.correct}/{fretboardScore.total} ✓
                  </Text>
                );
              }
              return (
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
                  Fret-by-fret study
                </Text>
              );
            }
            return (
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
                Guitar quiz
              </Text>
            );
          })()}
          {streak > 0 && (
            <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '700' }}>🔥 {streak}</Text>
          )}
        </View>

        {/* ═══ SUB-MODO MÁSTIL ═══ */}
        {quizSubMode === 'fretboard' && (<>

        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 }}>
          <TouchableOpacity
            onPress={() => setFretboardMode('single')}
            style={[
              styles.bpmChip,
              {
                flex: 1,
                backgroundColor: fretboardMode === 'single' ? colors.primary : colors.buttonBg,
                borderColor: fretboardMode === 'single' ? colors.primaryBorder : colors.buttonBorder,
              },
            ]}
          >
            <Text style={{ color: fretboardMode === 'single' ? colors.textOnPrimary : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
              Single note
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setFretboardMode('by-fret');
              setByFretRound(makeByFretRound());
              setByFretStarted(false);
              setByFretCountdown(null);
              setByFretFeedback({ type: 'idle', text: '' });
            }}
            style={[
              styles.bpmChip,
              {
                flex: 1,
                backgroundColor: fretboardMode === 'by-fret' ? colors.primary : colors.buttonBg,
                borderColor: fretboardMode === 'by-fret' ? colors.primaryBorder : colors.buttonBorder,
              },
            ]}
          >
            <Text style={{ color: fretboardMode === 'by-fret' ? colors.textOnPrimary : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
              By fret
            </Text>
          </TouchableOpacity>
        </View>

        {fretboardMode === 'single' && (
        <View style={[styles.modeCard, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder, marginTop: 0 }]}> 
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
            Mastered positions (&lt;2s): {masteredPositionKeys.size}/150
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            When you answer a position correctly in under 2s, it is marked as memorized and removed from the random pool.
          </Text>
        </View>
        )}

        {fretboardMode === 'single' && fretboardQ && (<>

        {/* ── Selector de dificultad ── */}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 14 }}>
          {(['easy', 'medium', 'hard'] as const).map(diff => (
            <TouchableOpacity
              key={diff}
              onPress={() => {
                setFretboardDifficulty(diff);
                fretboardDifficultyRef.current = diff;
                if (fretboardAdvanceRef.current) clearTimeout(fretboardAdvanceRef.current);
                spawnFretboardQuestion(diff);
              }}
              style={[
                styles.bpmChip,
                {
                  backgroundColor: fretboardDifficulty === diff ? colors.primary : colors.buttonBg,
                  borderColor: fretboardDifficulty === diff ? colors.primaryBorder : colors.buttonBorder,
                  flex: 1, paddingVertical: 8,
                },
              ]}
            >
              <Text style={{ color: fretboardDifficulty === diff ? colors.textOnPrimary : colors.textSecondary, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
                {(() => {
                  if (diff === 'easy') return 'Easy';
                  if (diff === 'medium') return 'Medium';
                  return 'Hard';
                })()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Pregunta ── */}
        <Text style={{ color: colors.textSecondary, fontSize: 13, letterSpacing: 0.4, textAlign: 'center', marginBottom: 10 }}>
          {'Which note is this?  '}
          <Text style={{ color: colors.text, fontWeight: '600' }}>String {fretboardQ.stringNumber}</Text>
          {fretboardQ.fret === 0 ? <Text style={{ color: colors.textSecondary }}>{' · open'}</Text> : null}
        </Text>

        {/* ── Mástil ── */}
        {(() => {
          const FB_STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];
          const qStringIdx = fretboardQ.stringNumber - 1;
          const fretWindowStart = Math.max(0, fretboardQ.fret - 2);
          const fretWindowEnd = Math.min(24, fretWindowStart + 6);
          const frets = Array.from({ length: fretWindowEnd - fretWindowStart + 1 }, (_, i) => fretWindowStart + i);
          const CELL_W = 44;
          const CELL_H = 40;
          const LABEL_W = 24;
          const isRevealed = fretboardAnswer !== null;
          const answeredCorrectly = fretboardAnswer === fretboardQ.correctNote;
          return (
            <View style={{ alignSelf: 'stretch', marginHorizontal: 8, marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', marginLeft: LABEL_W, marginBottom: 2 }}>
                {frets.map(f => (
                  <View key={f} style={{ width: CELL_W, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: colors.textSecondary + 'aa' }}>{f}</Text>
                  </View>
                ))}
              </View>
              {FB_STRING_LABELS.map((label) => {
                const sIdx = FB_STRING_LABELS.indexOf(label);
                return (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ width: LABEL_W, color: colors.textSecondary, fontSize: 11, textAlign: 'right', paddingRight: 4 }}>{label}</Text>
                  {frets.map(f => {
                    return renderByFretCell({
                      f,
                      sIdx,
                      qStringIdx,
                      questionFret: fretboardQ.fret,
                      isRevealed,
                      answeredCorrectly,
                      correctNote: fretboardQ.correctNote,
                      colors,
                      cellW: CELL_W,
                      cellH: CELL_H,
                    });
                  })}
                </View>
                );
              })}
            </View>
          );
        })()}

        {/* ── Botones de respuesta (1 fila × 4) ── */}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 14 }}>
          {fretboardQ.options.map(option => {
            const isAnswered = fretboardAnswer !== null;
            const isCorrectOption = option === fretboardQ.correctNote;
            const isChosen = option === fretboardAnswer;
            let bg = colors.buttonBg;
            let border = colors.buttonBorder;
            let textColor = colors.text;
            if (isAnswered && isCorrectOption) {
              bg = colors.inTune + '33';
              border = colors.inTune;
              textColor = colors.inTune;
            } else if (isAnswered && isChosen && !isCorrectOption) {
              bg = colors.sharp + '22';
              border = colors.sharp;
              textColor = colors.sharp;
            }
            return (
              <TouchableOpacity
                key={option}
                disabled={isAnswered}
                onPress={() => {
                  if (fretboardAnswer !== null) return;
                  const isRight = option === fretboardQ.correctNote;
                  const elapsedMs = Date.now() - fretboardStartRef.current;
                  setFretboardAnswer(option);
                  setFretboardScore(s => ({ correct: s.correct + (isRight ? 1 : 0), total: s.total + 1 }));
                  registerFretboardAttempt(fretboardQ.stringNumber, fretboardQ.fret, elapsedMs, isRight);
                  if (isRight) {
                    setStreak(s => s + 1);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  } else {
                    setStreak(0);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                  }
                  fretboardAdvanceRef.current = setTimeout(() => {
                    spawnFretboardQuestion(fretboardDifficultyRef.current);
                  }, 1400);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 14, paddingHorizontal: 4,
                  backgroundColor: bg, borderWidth: 1.5, borderColor: border,
                  borderRadius: 10, alignItems: 'center',
                }}
              >
                <Text style={{ color: textColor, fontSize: 18, fontWeight: '700' }}>{option}</Text>
                {isAnswered && isCorrectOption && (
                  <Text style={{ color: colors.inTune, fontSize: 9, marginTop: 1 }}>✓</Text>
                )}
                {isAnswered && isChosen && !isCorrectOption && (
                  <Text style={{ color: colors.sharp, fontSize: 9, marginTop: 1 }}>✗</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {fretboardAnswer === null && (
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}
            onPress={() => {
              if (fretboardAdvanceRef.current) clearTimeout(fretboardAdvanceRef.current);
              spawnFretboardQuestion(fretboardDifficultyRef.current);
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>Skip  →</Text>
          </TouchableOpacity>
        )}
        </>)}

        {fretboardMode === 'by-fret' && (
          <>
            <View style={[styles.challengeCard, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}> 
              <Text style={[styles.challengeLabel, { color: colors.textSecondary }]}>FRET QUIZ</Text>
              <Text style={[styles.challengeNote, { color: colors.primary, fontSize: 56, lineHeight: 62 }]}> 
                Fret {byFretRound.fret === 0 ? 'Open' : byFretRound.fret}
              </Text>
              <Text style={[styles.challengeDegree, { color: colors.textSecondary }]}>
                Current string: {STRING_LABELS[byFretRound.currentString - 1]}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                {byFretStatusText}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 10 }}>
              {([
                { key: 'easy', label: 'Easy', seconds: 24 },
                { key: 'medium', label: 'Medium', seconds: 18 },
                { key: 'hard', label: 'Hard', seconds: 12 },
              ] as const).map((option) => (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => {
                    setByFretDifficulty(option.key);
                    setByFretStarted(false);
                    setByFretCountdown(null);
                    setByFretFeedback({ type: 'idle', text: '' });
                  }}
                  style={[
                    styles.bpmChip,
                    {
                      flex: 1,
                      backgroundColor: byFretDifficulty === option.key ? colors.primary : colors.buttonBg,
                      borderColor: byFretDifficulty === option.key ? colors.primaryBorder : colors.buttonBorder,
                      paddingVertical: 8,
                    },
                  ]}
                >
                  <Text style={{ color: byFretDifficulty === option.key ? colors.textOnPrimary : colors.textSecondary, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
                    {option.label}
                  </Text>
                  <Text style={{ color: byFretDifficulty === option.key ? colors.textOnPrimary : colors.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 2 }}>
                    {option.seconds}s
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
              <TouchableOpacity
                style={[
                  styles.nextBtn,
                  {
                    backgroundColor: colors.secondary,
                    borderColor: colors.buttonBorder,
                    marginHorizontal: 0,
                    opacity: isByFretCountingDown ? 0.6 : 1,
                  },
                ]}
                disabled={isByFretCountingDown}
                onPress={startByFretCountdown}
              >
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>
                  {byFretStartButtonText}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.modeCard, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder, marginTop: 10 }]}> 
              {ALL_STRINGS.map((stringNumber) => {
                const isCurrent = stringNumber === byFretRound.currentString;
                return (
                  <View
                    key={stringNumber}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      paddingVertical: 6,
                      paddingHorizontal: 4,
                      borderRadius: 8,
                      backgroundColor: isCurrent ? colors.primary + '18' : 'transparent',
                    }}
                  >
                    <Text style={{ color: isCurrent ? colors.primary : colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
                      String {STRING_LABELS[stringNumber - 1]}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700', fontFamily: 'monospace' }}>?</Text>
                  </View>
                );
              })}
            </View>

            <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>
                {byFretInstructionText}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 6 }}>
                {byFretOptions.map((note, idx) => (
                  <TouchableOpacity
                    key={`${note}-${idx}`}
                    disabled={!byFretButtonsEnabled}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: byFretButtonsEnabled ? colors.primaryBorder : colors.buttonBorder,
                      borderRadius: 10,
                      backgroundColor: byFretButtonsEnabled ? colors.buttonBg : colors.secondary,
                      justifyContent: 'center',
                      alignItems: 'center',
                      paddingVertical: 12,
                      paddingHorizontal: 2,
                    }}
                    onPress={() => submitByFretChoice(note)}
                  >
                    <Text style={{ color: byFretButtonsEnabled ? colors.text : colors.textSecondary, fontSize: 14, fontWeight: '700', fontFamily: 'monospace' }}>
                      {note}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {byFretFeedback.text ? (
                <Text
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    fontWeight: '600',
                    color: byFretFeedback.type === 'ok' ? colors.inTune : colors.sharp,
                  }}
                >
                  {byFretFeedback.text}
                </Text>
              ) : null}
            </View>
          </>
        )}
        </>)}
        {/* ═══ FIN SUB-MODO MÁSTIL ═══ */}

        {/* ═══ SUB-MODO GUITARRA (micrófono) ═══ */}
        {quizSubMode === 'guitar' && challenge && (<>

        {/* Selector Root + Mode dentro del quiz guitarra */}
        <View style={styles.selectorsRow}>
          <View style={styles.selectorCol}>
            <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>ROOT</Text>
            <View style={styles.cycler}>
              <TouchableOpacity style={styles.chevronBtn} onPress={() => setRootNote(cyclePrev(ROOT_NOTES, rootNote))}>
                <Text style={[styles.chevronText, { color: colors.primary }]}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.cyclerValue, { color: colors.text }]}>{getRootNoteDisplay(rootNote, modeKey)}</Text>
              <TouchableOpacity style={styles.chevronBtn} onPress={() => setRootNote(cycleNext(ROOT_NOTES, rootNote))}>
                <Text style={[styles.chevronText, { color: colors.primary }]}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.selectorCol}>
            <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>MODE</Text>
            <View style={styles.cycler}>
              <TouchableOpacity style={styles.chevronBtn} onPress={() => setModeKey(cyclePrev(MODE_KEYS, modeKey))}>
                <Text style={[styles.chevronText, { color: colors.primary }]}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.cyclerValue, { color: colors.text }]}>{mode.name}</Text>
              <TouchableOpacity style={styles.chevronBtn} onPress={() => setModeKey(cycleNext(MODE_KEYS, modeKey))}>
                <Text style={[styles.chevronText, { color: colors.primary }]}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Tarjeta del reto */}
        <View style={[styles.challengeCard, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}>
          <Text style={[styles.challengeLabel, { color: colors.textSecondary }]}>PLAY THIS NOTE</Text>
          <Text style={[styles.challengeNote, { color: colors.primary }]}>{challenge.noteName}</Text>
          <Text style={[styles.challengeDegree, { color: colors.textSecondary }]}>
            {DEGREE_NAMES[challenge.degreeIdx]}{'  ·  '}{ROMAN[challenge.degreeIdx]}
          </Text>
          {challenge.stringHints.length > 0 && (
            <View style={styles.hintRow}>
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                💡 String{challenge.stringHints.length > 1 ? 's' : ''}:{'  '}
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {challenge.stringHints.map(n => STRING_LABELS[n - 1]).join('  ·  ')}
                </Text>
              </Text>
            </View>
          )}
        </View>

        {quizStatus === 'wrong' && (
          <TouchableOpacity
            style={[styles.wrongBanner, { backgroundColor: colors.sharp + '22', borderColor: colors.sharp }]}
            onPress={() => {
              if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
              setQuizStatus('waiting');
              quizStatusRef.current = 'waiting';
              hasEvaluatedRef.current = false;
              awaitingFreshQuizInputRef.current = false;
              previousQuizNoteIdxRef.current = null;
              quizDebounceCountRef.current = 0;
              setDetectionData({ frequency: null, actualNote: null });
            }}
          >
            <Text style={[styles.wrongBannerText, { color: colors.sharp }]}>
              ✗  Wrong note — expected {challenge.noteName}. Tap to retry.
            </Text>
            <Text style={[styles.wrongBannerX, { color: colors.sharp }]}>✕</Text>
          </TouchableOpacity>
        )}

        {(() => {
          let quizResultBg = colors.secondary;
          let quizResultBorder = colors.buttonBorder;
          let quizNoteColor = colors.text;
          let quizSubColor = colors.textSecondary;

          if (quizStatus === 'correct') {
            quizResultBg = colors.inTune + '22';
            quizResultBorder = colors.inTune;
            quizNoteColor = colors.primary;
            quizSubColor = colors.primary;
          } else if (quizStatus === 'wrong') {
            quizResultBg = colors.sharp + '22';
            quizResultBorder = colors.sharp;
            quizNoteColor = colors.sharp;
            quizSubColor = colors.sharp;
          }

          return (
        <View style={[
          styles.quizResult,
          {
            backgroundColor: quizResultBg,
            borderColor: quizResultBorder,
          },
        ]}>
          {detectionData.frequency ? (
            <>
              <Text style={{
                color: quizNoteColor,
                fontSize: 56, fontWeight: 'bold', fontFamily: 'monospace', lineHeight: 64,
              }}>{detectionData.actualNote}</Text>
              <Text style={{
                color: quizSubColor,
                fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textAlign: 'center',
              }}>
                {quizStatus === 'correct' && '✓  Correct!'}
                {quizStatus !== 'correct' && '…'}
              </Text>
            </>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 14, letterSpacing: 0.5 }}>🎸  Play a note…</Text>
          )}
        </View>
          );
        })()}

        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}
          onPress={() => {
            if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
            awaitingFreshQuizInputRef.current = false;
            previousQuizNoteIdxRef.current = null;
            spawnGuitarChallenge(rootNote, modeKey, challenge.noteIdx);
          }}
        >
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700', letterSpacing: 0.5 }}>
            Next  →
          </Text>
        </TouchableOpacity>
        </>)}
        {/* ═══ FIN SUB-MODO GUITARRA ═══ */}

        <View style={{ height: 24 }} />
        </>)}
        {/* ══════════ FIN QUIZ ══════════ */}

      </ScrollView>

      {/* ── Motor de audio (invisible) ── */}
      <FrequencyDetector
        onFrequencyDetected={handleFrequencyDetected}
        currentTuning={(TUNINGS as any).standard}
        isActive={isListening && !(screenMode === 'quiz' && quizSubMode === 'fretboard')}
        mode="auto"
        detectionMode="intonation"
        selectedString={null}
        onRawFrequency={() => {}}
        onBufferStatus={() => {}}
        onSignalLevel={() => {}}
        referencePitch={settings.referencePitch}
        yinThreshold={settings.yinThreshold}
      />
    </SafeAreaView>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  selectorsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 10,
  },
  selectorCol: {
    flex: 1,
  },
  selectorLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 4,
  },
  cycler: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chevronText: {
    fontSize: 26,
    fontWeight: '300',
  },
  cyclerValue: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    minWidth: 80,
  },
  modeCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 4,
  },
  modeTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modeDegree: {
    fontSize: 13,
    fontWeight: '400',
  },
  modeCharacteristic: {
    fontSize: 12,
    letterSpacing: 0.3,
  },
  noteChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 4,
  },
  noteChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  noteChipText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    gap: 8,
  },
  sectionLine: {
    flex: 1,
    height: 1,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  fretboard: {
    paddingHorizontal: 16,
  },
  fretNum: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  stringLabel: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  detector: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
    minHeight: 100,
    justifyContent: 'center',
  },
  detectorBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  // ── Quiz ──
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  challengeCard: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
  },
  challengeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
  },
  challengeNote: {
    fontSize: 72,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    lineHeight: 80,
    letterSpacing: 2,
  },
  challengeDegree: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  hintRow: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  hintText: {
    fontSize: 13,
    letterSpacing: 0.3,
  },
  streakRow: {
    alignItems: 'center',
    marginTop: 8,
  },
  streakText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  quizResult: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
    minHeight: 110,
    justifyContent: 'center',
  },
  nextBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  wrongBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wrongBannerText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    flex: 1,
  },
  wrongBannerX: {
    fontSize: 18,
    fontWeight: '700',
    paddingLeft: 12,
  },

  // ── Mode guide / explainer ──────────────────────────────────────────────
  modeGuideToggle: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 2,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
  },
  modeGuideToggleText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  modeGuidePanel: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  modeGuideLead: {
    fontSize: 13,
    lineHeight: 19,
  },
  modeGuideKey: {
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 4,
  },
  modeGuideRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  modeGuideEmoji: {
    fontSize: 22,
    lineHeight: 28,
    width: 28,
    textAlign: 'center',
  },
  modeGuideRowText: {
    flex: 1,
    gap: 2,
  },
  modeGuideRowTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  modeGuideRowDegree: {
    fontSize: 12,
    fontWeight: '400',
  },
  modeGuideRowDesc: {
    fontSize: 12,
    lineHeight: 17,
  },

  // ── Guide mode ──────────────────────────────────────────────────────────
  guideProgressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    gap: 5,
    justifyContent: 'center',
  },
  guideDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1,
  },
  guideCompleteCard: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
  },
  guideCompleteEmoji: {
    fontSize: 44,
    lineHeight: 52,
  },
  guideCompleteTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  guideCompleteSub: {
    fontSize: 13,
    letterSpacing: 0.3,
  },

  // ── Timed Quiz ──────────────────────────────────────────────────────────
  timedContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  timedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timedHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  timedToggleChipText: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    overflow: 'hidden',
  },
  bpmRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    justifyContent: 'center',
  },
  bpmChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 44,
    alignItems: 'center',
  },
  bpmChipText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  beatBarContainer: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
  },
  beatBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  timedBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  timedScore: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
    flex: 1,
  },
  timedStartBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
  },
  timedStartText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
