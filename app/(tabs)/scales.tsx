/**
 * Matebil Guitar Tuner — Scales & Modes Screen
 * Práctica de escalas: visualizador de mástil (3 notas por cuerda)
 * + detección en tiempo real de la nota tocada
 */

import FrequencyDetector from '@/src/components/FrequencyDetector';
import {
  MODES,
  ROOT_DISPLAY,
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
import { logger } from '@/src/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

// ─── Constantes de layout del mástil ───────────────────────────────────────
const FRET_WIDTH = 46;
const STRING_HEIGHT = 34;
const DOT_SIZE = 26;
const LABEL_WIDTH = 26;

// Orden cromático (sharps) — mismo que tunings.js
const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Mapeo de nombre de nota (sharp y flat) → índice cromático 0-11
const NOTE_CHROMA_MAP: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

/**
 * Comprueba si una frecuencia pertenece a la escala con tolerancia de ±50 cents.
 *
 * Convierte la frecuencia a MIDI continuo y mide la distancia a cada nota
 * de la escala. Si alguna nota está a ≤ 50 cents, la considera "en escala".
 * Esto evita falsos errores cuando la guitarra no está perfectamente afinada.
 *
 * @param freq         Frecuencia detectada en Hz
 * @param scaleNotes   Índices (0-11) de las notas de la escala
 * @param refPitch     Frecuencia de referencia para A4 (default 440)
 * @returns { inScale, degreeIdx }  degreeIdx = -1 si no está en escala
 */
function getScaleInfo(
  freq: number,
  scaleNotes: number[],
  refPitch: number = 440
): { inScale: boolean; degreeIdx: number } {
  if (!freq || freq <= 0) return { inScale: false, degreeIdx: -1 };

  // Número MIDI continuo: 69 = A4 = refPitch
  const midiFloat = 12 * Math.log2(freq / refPitch) + 69;

  let closestDegreeIdx = -1;
  let closestCents = Infinity;

  for (let i = 0; i < scaleNotes.length; i++) {
    const noteClass = scaleNotes[i]; // 0-11
    // Número MIDI entero más cercano que tenga esta clase de nota
    const nearestMidi = Math.round((midiFloat - noteClass) / 12) * 12 + noteClass;
    const cents = Math.abs((midiFloat - nearestMidi) * 100);
    if (cents < closestCents) {
      closestCents = cents;
      closestDegreeIdx = i;
    }
  }

  // Tolerancia: cuarto de tono (25 cents).
  // Suficiente para perdonar pequeñas imperfecciones de afinación,
  // pero F# y G siempre se distinguen con claridad.
  const inScale = closestCents <= 25;
  return { inScale, degreeIdx: inScale ? closestDegreeIdx : -1 };
}

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

// Degree names
const DEGREE_NAMES = ['Root', '2nd', '3rd', '4th', '5th', '6th', '7th'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// ─── Tipo de reto ────────────────────────────────────────────────────────────
type ChallengeType = {
  noteName: string;   // Nombre para mostrar (ej. "F#")
  noteIdx: number;    // Índice cromático 0-11
  degreeIdx: number;  // Grado en la escala, 0-indexed
  stringHints: number[]; // Cuerdas donde aparece en el patrón 3-notas-por-cuerda
};

/**
 * Genera un reto aleatorio para el modo Quiz.
 * Evita repetir la misma nota que el reto anterior.
 */
function makeChallenge(
  rootNote: string,
  modeKey: string,
  prevNoteIdx?: number
): ChallengeType {
  const scaleNoteIndices = getScaleNotes(rootNote, modeKey);
  const scaleNames = getScaleNoteNames(rootNote, modeKey);
  const pattern = getThreeNotesPerString(rootNote, modeKey);

  // Elegir grado aleatorio, evitando repetir el anterior
  let degreeIdx = Math.floor(Math.random() * 7);
  if (prevNoteIdx !== undefined && scaleNoteIndices[degreeIdx] === prevNoteIdx) {
    degreeIdx = (degreeIdx + 1 + Math.floor(Math.random() * 5)) % 7;
  }

  const noteIdx = scaleNoteIndices[degreeIdx];
  const noteName = scaleNames[degreeIdx];

  // ¿En qué cuerdas aparece este grado en el patrón de 3 notas por cuerda?
  const stringHints: number[] = [];
  for (const str of pattern) {
    if ((str as any).notes.some((n: any) => n.degree === degreeIdx + 1)) {
      stringHints.push((str as any).stringNumber);
    }
  }

  return { noteName, noteIdx, degreeIdx, stringHints };
}

// ─── Tipo para modo Guide ────────────────────────────────────────────────────
type GuideNote = {
  stringNumber: number;
  fret: number;
  noteName: string;
  noteIdx: number;  // 0-11 cromático
  degree: number;   // 1-7
};

/**
 * Construye la secuencia de 18 notas para el modo guiado
 * (6 cuerdas × 3 notas por cuerda), en orden ascendente o descendente.
 */
function buildGuideSequence(
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

// ─── Helpers ────────────────────────────────────────────────────────────────
function cyclePrev<T>(arr: T[], current: T): T {
  const idx = arr.indexOf(current);
  return arr[(idx - 1 + arr.length) % arr.length];
}
function cycleNext<T>(arr: T[], current: T): T {
  const idx = arr.indexOf(current);
  return arr[(idx + 1) % arr.length];
}

// ─── Fretboard Quiz ──────────────────────────────────────────────────────────
type FretboardQ = {
  stringNumber: number;  // 1-6 (1 = mi agudo, 6 = mi grave)
  fret: number;          // 0-12
  correctNote: string;   // e.g. "G#"
  options: string[];     // 4 opciones mezcladas (1 correcta + 3 distractores)
};

/**
 * Genera una pregunta aleatoria para el fretboard quiz:
 * elige cuerda/traste y devuelve la nota correcta + 3 distractores cromáticos.
 */
function makeFretboardQuestion(difficulty: 'easy' | 'medium' | 'hard'): FretboardQ {
  const FB_NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  // MIDI al aire: índice 0 = cuerda 1 (mi agudo, E4=64) … índice 5 = cuerda 6 (mi grave, E2=40)
  const OPEN_MIDI = [64, 59, 55, 50, 45, 40];
  const maxFret = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 9 : 12;
  const stringIdx = Math.floor(Math.random() * 6);
  const fret = Math.floor(Math.random() * (maxFret + 1));
  const noteChroma = (OPEN_MIDI[stringIdx] + fret) % 12;
  const correctNote = FB_NOTES[noteChroma];
  // Distractores cromáticos (vecinos inmediatos = más difícil distinguir)
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
    if (!used.has(n) && wrong.length < 3) { wrong.push(n); used.add(n); }
  }
  const rest = FB_NOTES.filter(n => !used.has(n)).sort(() => Math.random() - 0.5);
  for (const n of rest) { if (wrong.length >= 3) break; wrong.push(n); }
  const options = [correctNote, ...wrong].sort(() => Math.random() - 0.5);
  return { stringNumber: stringIdx + 1, fret, correctNote, options };
}

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
    AsyncStorage.multiGet(['practiceScreenMode', 'practiceRootNote', 'practiceModeKey', 'practiceType']).then((pairs) => {
      const map = Object.fromEntries(pairs.map(([k, v]) => [k, v]));
      if (map.practiceScreenMode === 'guide' || map.practiceScreenMode === 'quiz' || map.practiceScreenMode === 'practice') {
        setScreenMode(map.practiceScreenMode);
        screenModeRef.current = map.practiceScreenMode;
      }
      if (map.practiceRootNote) setRootNote(map.practiceRootNote);
      if (map.practiceModeKey) setModeKey(map.practiceModeKey);
      if (map.practiceType === 'modes' || map.practiceType === 'pentatonics') setPracticeType(map.practiceType);
    }).catch(() => {});
  }, []);

  // Persist whenever screenMode, rootNote or modeKey changes
  useEffect(() => {
    AsyncStorage.setItem('practiceScreenMode', screenMode).catch(() => {});
  }, [screenMode]);
  useEffect(() => {
    AsyncStorage.setItem('practiceRootNote', rootNote).catch(() => {});
  }, [rootNote]);
  useEffect(() => {
    AsyncStorage.setItem('practiceModeKey', modeKey).catch(() => {});
  }, [modeKey]);
  useEffect(() => {
    AsyncStorage.setItem('practiceType', practiceType).catch(() => {});
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
  const quizDebounceCountRef = useRef(0);            // consecutive stable detections before scoring
  const QUIZ_DEBOUNCE_FRAMES = 3;                    // ~75 ms at 25 ms interval

  // ── Estado del Fretboard Quiz (sin guitarra) ──────────────────────────────
  const [fretboardQ, setFretboardQ] = useState<FretboardQ | null>(null);
  const [fretboardAnswer, setFretboardAnswer] = useState<string | null>(null);
  const [fretboardScore, setFretboardScore] = useState({ correct: 0, total: 0 });
  const [fretboardDifficulty, setFretboardDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const fretboardDifficultyRef = useRef<'easy' | 'medium' | 'hard'>('medium');
  const fretboardAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const guidePositionRef = useRef(0);
  const guideStatusRef = useRef<'waiting' | 'hit' | 'done'>('waiting');
  const guideDirectionRef = useRef<'asc' | 'desc'>('asc');

  // ── Estado modo Quiz Timed ───────────────────────────────────────────────
  const [isTimedMode, setIsTimedMode] = useState(false);
  const [timedBpm, setTimedBpm] = useState(60);
  const [timedRunning, setTimedRunning] = useState(false);
  const [timedScore, setTimedScore] = useState({ correct: 0, total: 0 });
  const timedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beatProgressAnim = useRef(new Animated.Value(0)).current;
  const beatAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const isTimedModeRef = useRef(false);
  const timedRunningRef = useRef(false);
  const timedBpmRef = useRef(60);

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
  const guideSequence = buildGuideSequence(rootNote, modeKey, guideDirection);
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
    };
  }, []);

  // Sincronizar refs con el estado
  useEffect(() => { screenModeRef.current = screenMode; }, [screenMode]);
  useEffect(() => { challengeRef.current = challenge; }, [challenge]);
  useEffect(() => { quizStatusRef.current = quizStatus; }, [quizStatus]);
  useEffect(() => { rootNoteRef.current = rootNote; }, [rootNote]);
  useEffect(() => { modeKeyRef.current = modeKey; }, [modeKey]);
  useEffect(() => { guidePositionRef.current = guidePosition; }, [guidePosition]);
  useEffect(() => { guideStatusRef.current = guideStatus; }, [guideStatus]);
  useEffect(() => { guideDirectionRef.current = guideDirection; }, [guideDirection]);
  useEffect(() => { isTimedModeRef.current = isTimedMode; }, [isTimedMode]);
  useEffect(() => { timedRunningRef.current = timedRunning; }, [timedRunning]);
  useEffect(() => { timedBpmRef.current = timedBpm; }, [timedBpm]);

  // Cuando cambian root/mode en modo quiz, regenerar reto
  useEffect(() => {
    if (screenModeRef.current === 'quiz') {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      const newC = makeChallenge(rootNote, modeKey);
      setChallenge(newC);
      challengeRef.current = newC;
      setQuizStatus('waiting');
      quizStatusRef.current = 'waiting';
      hasEvaluatedRef.current = false;
    }
    // En modo guide, reiniciar desde la primera nota
    if (screenModeRef.current === 'guide') {
      setGuidePosition(0);
      guidePositionRef.current = 0;
      setGuideStatus('waiting');
      guideStatusRef.current = 'waiting';
      hasEvaluatedRef.current = false;
    }
  }, [rootNote, modeKey]);

  // Reiniciar posición al cambiar dirección en guide
  useEffect(() => {
    setGuidePosition(0);
    guidePositionRef.current = 0;
    setGuideStatus('waiting');
    guideStatusRef.current = 'waiting';
    hasEvaluatedRef.current = false;
  }, [guideDirection]);

  // ── Metrónomo del modo Quiz Timed ────────────────────────────────────────
  const stopTimedMode = useCallback(() => {
    if (timedIntervalRef.current) {
      clearInterval(timedIntervalRef.current);
      timedIntervalRef.current = null;
    }
    if (beatAnimRef.current) beatAnimRef.current.stop();
    beatProgressAnim.setValue(0);
    setTimedRunning(false);
    timedRunningRef.current = false;
  }, [beatProgressAnim]);

  const startTimedMode = useCallback(() => {
    const beatMs = Math.round(60000 / timedBpmRef.current);

    const animateBeat = () => {
      beatProgressAnim.setValue(0);
      beatAnimRef.current = Animated.timing(beatProgressAnim, {
        toValue: 1,
        duration: beatMs,
        useNativeDriver: false,
      });
      beatAnimRef.current.start();
    };

    const advanceBeat = () => {
      // Puntuar el beat actual
      if (quizStatusRef.current === 'correct') {
        setTimedScore((s) => ({ correct: s.correct + 1, total: s.total + 1 }));
      } else {
        setTimedScore((s) => ({ ...s, total: s.total + 1 }));
      }
      // Nuevo reto
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      const newC = makeChallenge(rootNoteRef.current, modeKeyRef.current, challengeRef.current?.noteIdx);
      setChallenge(newC);
      challengeRef.current = newC;
      setQuizStatus('waiting');
      quizStatusRef.current = 'waiting';
      setDetectionData({ frequency: null, actualNote: null });
      hasEvaluatedRef.current = false;
      animateBeat();
    };

    animateBeat();
    timedIntervalRef.current = setInterval(advanceBeat, beatMs);
    setTimedRunning(true);
    timedRunningRef.current = true;
  }, [beatProgressAnim, stopTimedMode]);

  // Limpiar timed interval al desmontar o cambiar de modo
  useEffect(() => {
    if (screenMode !== 'quiz') stopTimedMode();
  }, [screenMode, stopTimedMode]);

  useEffect(() => {
    return () => stopTimedMode();
  }, [stopTimedMode]);

  // ── Inicializar fretboard quiz al entrar en modo quiz ─────────────────────
  useEffect(() => {
    if (screenMode === 'quiz') {
      if (fretboardAdvanceRef.current) clearTimeout(fretboardAdvanceRef.current);
      const q = makeFretboardQuestion(fretboardDifficultyRef.current);
      setFretboardQ(q);
      setFretboardAnswer(null);
      setFretboardScore({ correct: 0, total: 0 });
      setStreak(0);
    } else {
      if (fretboardAdvanceRef.current) clearTimeout(fretboardAdvanceRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenMode]);

  // ── Callback de detección ────────────────────────────────────────────────
  const handleFrequencyDetected = (data: any) => {
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }

    if (!data.frequency) {
      quizDebounceCountRef.current = 0;
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
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          autoAdvanceRef.current = setTimeout(() => {
            const newC = makeChallenge(rootNoteRef.current, modeKeyRef.current, challengeRef.current?.noteIdx);
            setChallenge(newC);
            challengeRef.current = newC;
            setQuizStatus('waiting');
            quizStatusRef.current = 'waiting';
            setDetectionData({ frequency: null, actualNote: null });
            hasEvaluatedRef.current = false;
            quizDebounceCountRef.current = 0;
          }, 1500);
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
      const seq = buildGuideSequence(
        rootNoteRef.current,
        modeKeyRef.current,
        guideDirectionRef.current
      );
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
  const playedNoteIdx = detectionData.actualNote != null
    ? (NOTE_CHROMA_MAP[detectionData.actualNote] ?? -1)
    : -1;

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
                const newC = makeChallenge(rootNote, modeKey);
                setChallenge(newC);
                challengeRef.current = newC;
                setQuizStatus('waiting');
                quizStatusRef.current = 'waiting';
                setStreak(0);
                hasEvaluatedRef.current = false;
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
            {scaleNoteNames.map((noteName: string, idx: number) => (
              <View
                key={idx}
                style={[
                  styles.noteChip,
                  {
                    backgroundColor: idx === 0 ? colors.primary : colors.buttonBg,
                    borderColor: idx === 0 ? colors.primaryBorder : colors.buttonBorder,
                  },
                ]}
              >
                <Text style={[
                  styles.noteChipText,
                  { color: idx === 0 ? colors.textOnPrimary : colors.text },
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

        {/* ── What are modes? (oculto en Quiz) ── */}
        {screenMode !== 'quiz' && (<>
        <TouchableOpacity
          style={[styles.modeGuideToggle, { borderColor: colors.buttonBorder }]}
          onPress={() => setShowModeGuide(v => !v)}
        >
          <Text style={[styles.modeGuideToggleText, { color: colors.textSecondary }]}>
            ℹ  What are modes?
          </Text>
          <Text style={[styles.modeGuideToggleText, { color: colors.textSecondary }]}>
            {showModeGuide ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>

        {showModeGuide && (
          <View style={[styles.modeGuidePanel, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}>
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
          </View>
        )}
        </>)}
        {/* ══════════ MODO PRACTICE ══════════ */}
        {screenMode === 'practice' && (<>

        {/* ── Sub-toggle: Modes / Pentatonics ── */}
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
                const isNut = f === 0;
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
                    {/* Línea de cuerda */}
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
                    {/* Dot de nota */}
                    {note ? (() => {
                      const isPlayed = playedNoteIdx !== -1 &&
                        NOTE_NAMES_SHARP.indexOf(note.noteNameSharp) === playedNoteIdx;
                      const dotBg = isPlayed
                        ? (detectedInScale ? '#22c55e' : colors.sharp)
                        : (note.isRoot ? colors.primary : colors.secondary);
                      const dotBorder = isPlayed
                        ? (detectedInScale ? '#16a34a' : colors.sharp)
                        : (note.isRoot ? colors.primaryBorder : colors.buttonBorder);
                      const dotTextColor = isPlayed
                        ? '#fff'
                        : (note.isRoot ? colors.textOnPrimary : colors.text);
                      return (
                        <Animated.View
                          style={{
                            width: DOT_SIZE,
                            height: DOT_SIZE,
                            borderRadius: DOT_SIZE / 2,
                            backgroundColor: dotBg,
                            borderWidth: isPlayed ? 2.5 : (note.isRoot ? 2 : 1),
                            borderColor: dotBorder,
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1,
                            opacity: isPlayed ? pulseAnim : 1,
                            transform: isPlayed ? [{ scale: pulseAnim.interpolate({
                              inputRange: [0.45, 1],
                              outputRange: [1, 1.22],
                            }) }] : [],
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
                    })() : null}
                  </View>
                );
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
          {diatonicChords.map((chord: any, idx: number) => (
            <TouchableOpacity
              key={idx}
              onPress={() => setSelectedChordIdx(idx)}
              style={[
                styles.noteChip,
                {
                  backgroundColor: selectedChordIdx === idx ? colors.primary : colors.buttonBg,
                  borderColor: selectedChordIdx === idx ? colors.primaryBorder : colors.buttonBorder,
                },
              ]}
            >
              <Text style={[
                styles.noteChipText,
                { color: selectedChordIdx === idx ? colors.textOnPrimary : colors.text },
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
          const pentNoteIdxSet = new Set(
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
                  {pentNoteNames.map((name: string, idx: number) => (
                    <View
                      key={idx}
                      style={[
                        styles.noteChip,
                        {
                          backgroundColor: idx === 0 ? colors.primary : colors.buttonBg,
                          borderColor: idx === 0 ? colors.primaryBorder : colors.buttonBorder,
                        },
                      ]}
                    >
                      <Text style={[
                        styles.noteChipText,
                        { color: idx === 0 ? colors.textOnPrimary : colors.text },
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
                      const isNut = f === 0;
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
                          {note && (() => {
                            const noteIdx = NOTE_CHROMA_MAP[note.noteName] ?? -1;
                            const isPlayed = playedNoteIdx !== -1 && noteIdx === playedNoteIdx;
                            const isInPentatonic = isPlayed ? pentNoteIdxSet.has(playedNoteIdx) : true;
                            return (
                            <Animated.View
                              style={{
                                width: DOT_SIZE,
                                height: DOT_SIZE,
                                borderRadius: DOT_SIZE / 2,
                                backgroundColor: isPlayed
                                  ? (isInPentatonic ? '#22c55e' : colors.sharp)
                                  : (note.isRoot ? colors.primary : colors.secondary),
                                borderWidth: isPlayed ? 2.5 : (note.isRoot ? 2 : 1),
                                borderColor: isPlayed
                                  ? (isInPentatonic ? '#16a34a' : colors.sharp)
                                  : (note.isRoot ? colors.primaryBorder : colors.buttonBorder),
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 1,
                                opacity: isPlayed ? pulseAnim : 1,
                                transform: isPlayed ? [{ scale: pulseAnim.interpolate({
                                  inputRange: [0.45, 1],
                                  outputRange: [1, 1.22],
                                }) }] : [],
                              }}
                            >
                              <Text
                                style={{
                                  color: isPlayed ? '#fff' : (note.isRoot ? colors.textOnPrimary : colors.text),
                                  fontSize: note.noteName.length > 2 ? 7 : 9,
                                  fontWeight: 'bold',
                                  fontFamily: 'monospace',
                                }}
                              >
                                {note.noteName}
                              </Text>
                            </Animated.View>
                            );
                          })()}
                        </View>
                      );
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
                  {detectedInScale
                    ? (practiceType === 'pentatonics'
                      ? '✓  In pentatonic'
                      : `✓  In scale  ·  ${DEGREE_NAMES[detectedDegree]} (${ROMAN[detectedDegree]})`)
                    : (practiceType === 'pentatonics' ? '✗  Out of pentatonic' : '✗  Out of scale')}
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

        {/* ── Barra de progreso (18 puntos) ── */}
        <View style={styles.guideProgressRow}>
          {guideSequence.map((_, i) => (
            <View
              key={i}
              style={[
                styles.guideDot,
                {
                  backgroundColor:
                    i < guidePosition ? colors.primary :
                    i === guidePosition && guideStatus !== 'done' ? colors.flat :
                    colors.buttonBg,
                  borderColor:
                    i < guidePosition ? colors.primaryBorder :
                    i === guidePosition && guideStatus !== 'done' ? colors.flatBorder :
                    colors.buttonBorder,
                },
              ]}
            />
          ))}
        </View>

        {guideStatus === 'done' ? (
          /* ── Completado ── */
          <View style={[styles.guideCompleteCard, { backgroundColor: colors.secondary, borderColor: colors.inTuneBorder }]}>
            <Text style={styles.guideCompleteEmoji}>🎉</Text>
            <Text style={[styles.guideCompleteTitle, { color: colors.primary }]}>
              Scale complete!
            </Text>
            <Text style={[styles.guideCompleteSub, { color: colors.textSecondary }]}>
              {getRootNoteDisplay(rootNote, modeKey)} {mode.name} · 18 notes
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
              setFretboardQ(makeFretboardQuestion(fretboardDifficultyRef.current));
              setFretboardAnswer(null);
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
              const newC = makeChallenge(rootNote, modeKey);
              setChallenge(newC);
              challengeRef.current = newC;
              setQuizStatus('waiting');
              quizStatusRef.current = 'waiting';
              setStreak(0);
              hasEvaluatedRef.current = false;
              quizDebounceCountRef.current = 0;
            }}
          >
            <Text style={[styles.toggleText, { color: quizSubMode === 'guitar' ? colors.textOnPrimary : colors.textSecondary }]}>
              🎤  Guitar
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Encabezado: puntuación + racha ── */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8, marginTop: 8 }}>
          {quizSubMode === 'fretboard' ? (
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
              {fretboardScore.correct}/{fretboardScore.total} ✓
            </Text>
          ) : (
            <View />
          )}
          {streak > 0 && (
            <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '700' }}>🔥 {streak}</Text>
          )}
        </View>

        {/* ═══ SUB-MODO MÁSTIL ═══ */}
        {quizSubMode === 'fretboard' && fretboardQ && (<>

        {/* ── Selector de dificultad ── */}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 14 }}>
          {(['easy', 'medium', 'hard'] as const).map(diff => (
            <TouchableOpacity
              key={diff}
              onPress={() => {
                setFretboardDifficulty(diff);
                fretboardDifficultyRef.current = diff;
                if (fretboardAdvanceRef.current) clearTimeout(fretboardAdvanceRef.current);
                const newQ = makeFretboardQuestion(diff);
                setFretboardQ(newQ);
                setFretboardAnswer(null);
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
                {diff === 'easy' ? 'Easy' : diff === 'medium' ? 'Medium' : 'Hard'}
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
          const fretWindowEnd = Math.min(12, fretWindowStart + 6);
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
              {FB_STRING_LABELS.map((label, sIdx) => (
                <View key={sIdx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ width: LABEL_W, color: colors.textSecondary, fontSize: 11, textAlign: 'right', paddingRight: 4 }}>{label}</Text>
                  {frets.map(f => {
                    const isQuestion = sIdx === qStringIdx && f === fretboardQ.fret;
                    const thickness = sIdx >= 3 ? (sIdx === 5 ? 2.5 : 2) : 1;
                    return (
                      <View
                        key={f}
                        style={{
                          width: CELL_W, height: CELL_H,
                          borderLeftWidth: f === 0 ? 4 : 0,
                          borderLeftColor: colors.text,
                          justifyContent: 'center', alignItems: 'center',
                          backgroundColor: isQuestion && isRevealed
                            ? (answeredCorrectly ? colors.inTune + '22' : colors.sharp + '22')
                            : 'transparent',
                        }}
                      >
                        {f > 0 && (
                          <View style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 1, backgroundColor: colors.buttonBorder + '66' }} />
                        )}
                        <View style={{
                          position: 'absolute', left: 0, right: 0,
                          top: CELL_H / 2 - thickness / 2,
                          height: thickness,
                          backgroundColor: colors.textSecondary + '55',
                        }} />
                        {isQuestion && (
                          <View style={{
                            width: 32, height: 32, borderRadius: 16,
                            backgroundColor: isRevealed
                              ? (answeredCorrectly ? colors.inTune : colors.sharp)
                              : colors.primary,
                            justifyContent: 'center', alignItems: 'center', zIndex: 2,
                            shadowColor: colors.primary, shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: isRevealed ? 0 : 0.5, shadowRadius: 4, elevation: isRevealed ? 0 : 4,
                          }}>
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: isRevealed ? 10 : 18 }}>
                              {isRevealed ? fretboardQ.correctNote : '?'}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })()}

        {/* ── Botones de respuesta (1 fila × 4) ── */}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 14 }}>
          {fretboardQ.options.map(option => {
            const isAnswered = fretboardAnswer !== null;
            const isCorrectOption = option === fretboardQ.correctNote;
            const isChosen = option === fretboardAnswer;
            const bg = isAnswered && isCorrectOption
              ? colors.inTune + '33'
              : isAnswered && isChosen && !isCorrectOption ? colors.sharp + '22' : colors.buttonBg;
            const border = isAnswered && isCorrectOption
              ? colors.inTune
              : isAnswered && isChosen && !isCorrectOption ? colors.sharp : colors.buttonBorder;
            const textColor = isAnswered && isCorrectOption
              ? colors.inTune
              : isAnswered && isChosen && !isCorrectOption ? colors.sharp : colors.text;
            return (
              <TouchableOpacity
                key={option}
                disabled={isAnswered}
                onPress={() => {
                  if (fretboardAnswer !== null) return;
                  const isRight = option === fretboardQ.correctNote;
                  setFretboardAnswer(option);
                  setFretboardScore(s => ({ correct: s.correct + (isRight ? 1 : 0), total: s.total + 1 }));
                  if (isRight) {
                    setStreak(s => s + 1);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  } else {
                    setStreak(0);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                  }
                  fretboardAdvanceRef.current = setTimeout(() => {
                    setFretboardQ(makeFretboardQuestion(fretboardDifficultyRef.current));
                    setFretboardAnswer(null);
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
              setFretboardQ(makeFretboardQuestion(fretboardDifficultyRef.current));
              setFretboardAnswer(null);
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>Skip  →</Text>
          </TouchableOpacity>
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

        <View style={[
          styles.quizResult,
          {
            backgroundColor: quizStatus === 'correct' ? colors.inTune + '22' :
              quizStatus === 'wrong' ? colors.sharp + '22' : colors.secondary,
            borderColor: quizStatus === 'correct' ? colors.inTune :
              quizStatus === 'wrong' ? colors.sharp : colors.buttonBorder,
          },
        ]}>
          {detectionData.frequency ? (
            <>
              <Text style={{
                color: quizStatus === 'correct' ? colors.primary : quizStatus === 'wrong' ? colors.sharp : colors.text,
                fontSize: 56, fontWeight: 'bold', fontFamily: 'monospace', lineHeight: 64,
              }}>{detectionData.actualNote}</Text>
              <Text style={{
                color: quizStatus === 'correct' ? colors.primary : quizStatus === 'wrong' ? colors.sharp : colors.textSecondary,
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

        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.secondary, borderColor: colors.buttonBorder }]}
          onPress={() => {
            if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
            const newC = makeChallenge(rootNote, modeKey, challenge.noteIdx);
            setChallenge(newC);
            challengeRef.current = newC;
            setQuizStatus('waiting');
            quizStatusRef.current = 'waiting';
            setDetectionData({ frequency: null, actualNote: null });
            hasEvaluatedRef.current = false;
            quizDebounceCountRef.current = 0;
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
