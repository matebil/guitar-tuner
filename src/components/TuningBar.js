/**
 * Matebil Guitar Tuner
 * Copyright (c) 2025 Matebil Limited
 * Licensed under MIT License
 * https://github.com/matebil/guitar-tuner
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';

// ─── Horseshoe geometry ────────────────────────────────────────────────────
const NUM_BARS        = 31;           // must be odd — more bars = denser arc
const CENTER          = 15;           // index of centre bar
const MAX_CENTS       = 50;
const ARC_DEG         = 160;          // total spread ±80° from vertical-up
const W               = 300;          // component width
const H               = 206;          // component height
const OX              = W / 2;        // arc origin x  (centre of note)
const OY              = 195;          // arc origin y  (centre of note area)
const INNER_R         = 70;           // gap from origin to inner edge of bars
const MAX_BAR_H       = 58;           // centre bar height
const MIN_BAR_H       = 28;           // edge bar height

// ─── Stability config ──────────────────────────────────────────────────────
const STABILITY_N     = 8;
const STABILITY_CENTS = 4;

export default function TuningBar({ centsOff = 0, isActive = false, noteName = null, colors }) {
  const blinkAnim  = useRef(new Animated.Value(1)).current;
  const blinkLoop  = useRef(null);
  const historyRef = useRef([]);
  const [isStable, setIsStable] = useState(false);

  // Compute these early so useEffects below can reference them
  const isInTune   = isActive && Math.abs(centsOff) <= 4;
  const activeBars = isInTune ? 0 : Math.round((Math.abs(centsOff) / MAX_CENTS) * CENTER);

  // ── Stability tracking ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) { historyRef.current = []; setIsStable(false); return; }
    const next = [...historyRef.current.slice(-(STABILITY_N - 1)), centsOff];
    historyRef.current = next;
    if (next.length >= STABILITY_N) {
      const spread = Math.max(...next) - Math.min(...next);
      setIsStable(spread < STABILITY_CENTS);
    } else {
      setIsStable(false);
    }
  }, [centsOff, isActive]);

  // ── Blink centre bar only when very close (1 bar left) but not yet in tune
  const nearlyInTune = isActive && activeBars <= 1 && !isInTune;

  useEffect(() => {
    if (blinkLoop.current) { blinkLoop.current.stop(); blinkLoop.current = null; }
    blinkAnim.setValue(1);
    if (nearlyInTune) {
      blinkLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.08, duration: 250, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1.0,  duration: 250, useNativeDriver: true }),
        ])
      );
      blinkLoop.current.start();
    }
    return () => { if (blinkLoop.current) blinkLoop.current.stop(); };
  }, [nearlyInTune]);

  // ── Bar colour ─────────────────────────────────────────────────────────
  function barColor(idx) {
    if (idx === CENTER) {
      if (!isActive) return colors.buttonBorder;
      if (isInTune)  return colors.inTune;
      return colors.primary;
    }
    const offset      = idx - CENTER;
    const correctSide = centsOff >= 0 ? offset > 0 : offset < 0;
    const lit         = isActive && correctSide && Math.abs(offset) <= activeBars;
    if (!lit) return colors.secondary;
    return offset < 0 ? colors.flat : colors.sharp;
  }

  // ── Bar geometry ───────────────────────────────────────────────────────
  // Bars radiate UPWARD and outward from (OX, OY).
  // Angle 0 = straight up (centre bar). Bars are rotated by their angle.
  // Height varies: tallest at centre, shortest at edges.
  // Width is intentionally thick (fuel-gauge segments) — the arc spacing
  // between bars provides the natural gap without explicit padding.
  const bars = Array.from({ length: NUM_BARS }, (_, i) => {
    const t      = (i - CENTER) / CENTER;                        // –1 … +1
    const angle  = t * (ARC_DEG / 2);                           // –80 … +80 deg
    const rad    = (angle * Math.PI) / 180;
    const barH   = MIN_BAR_H + (MAX_BAR_H - MIN_BAR_H) * Math.pow(1 - Math.abs(t), 1.4);
    const barW   = i === CENTER ? 9 : 7;                        // filled segments
    const midR   = INNER_R + barH / 2;
    // Position the centre of the bar on the arc, bars point outward from origin
    const cx     = OX + midR * Math.sin(rad) - barW / 2;
    const cy     = OY - midR * Math.cos(rad) - barH / 2;
    return { i, angle, barH, barW, cx, cy };
  });

  const noteColor = (isActive && isInTune && isStable) ? colors.inTune
                  : isActive ? colors.text : colors.textSecondary;



  return (
    <View style={{ alignItems: 'center', width: W, height: H }}>

      {/* ── Arc of bars ───────────────────────────────────────────────── */}
      {bars.map(({ i, angle, barH, barW, cx, cy }) => {
        const isCentre = i === CENTER;
        return (
          <Animated.View
            key={i}
            style={{
              position:        'absolute',
              width:           barW,
              height:          barH,
              left:            cx,
              top:             cy,
              borderRadius:    barW / 2,
              backgroundColor: barColor(i),
              opacity:         isCentre && isActive && !isInTune ? blinkAnim : 1,
              ...(isCentre && isInTune && isStable ? {
                shadowColor:   colors.inTune,
                shadowOffset:  { width: 0, height: 0 },
                shadowOpacity: 0.9,
                shadowRadius:  8,
                elevation:     6,
              } : {}),
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        );
      })}

      {/* ── ♭ / ♯ labels — next to the horseshoe opening ends ─────── */}
      {/* OX ± INNER_R*sin(80°) ≈ 81 and 219; centre text there */}
      <Text style={{ position: 'absolute', left: 68, top: OY - 12,
        fontSize: 16, fontWeight: '800', color: colors.flat }}>♭</Text>
      <Text style={{ position: 'absolute', right: 68, top: OY - 12,
        fontSize: 16, fontWeight: '800', color: colors.sharp }}>♯</Text>

      {/* ── Note name — centred inside the horseshoe hole ─────────────── */}
      {/* Hole: y = (OY - INNER_R) to OY = 125..195. Centre at OY - INNER_R/2 = 160 */}
      <View style={{ position: 'absolute', left: 0, right: 0,
        top: OY - INNER_R / 2 - 34, alignItems: 'center' }}>
        <Text style={{
          fontSize: 60, fontWeight: 'bold', fontFamily: 'monospace',
          color: noteColor, lineHeight: 68,
          textShadowColor: (isActive && isInTune && isStable) ? colors.inTune : 'transparent',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 14,
        }}>
          {noteName || '–'}
        </Text>
      </View>


    </View>
  );
}
