import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Line, Polygon, Rect } from 'react-native-svg';

import type { StayCategory, ThemeColors } from '@/constants/tokens';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

/**
 * The hero's street — a road across the whole hero, with the category's
 * building standing on the right.
 *
 * PG / Hostel is a five-storey block with a water tank, Bachelor a four-storey
 * flat with balconies, House / Co-live a pitched-roof house with a tree, Hotel
 * a tower with its "H" on the roof, Commercial a shop with a striped awning.
 * Cars, an auto, a scooter and a student on a bicycle drive past in two lanes;
 * people walk the front pavement; and students with bags walk the back one,
 * stop at the building's door and go in. Changing the category raises the new
 * building and lights its windows one by one.
 *
 * Drawn, not rendered, in an oblique projection: every front face is square
 * on, so traffic can cross left to right, and each building shows its right
 * side and roof receding up and to the right. Faces are shaded from the
 * category's own colour — the front lit, the side in shade, the roof palest.
 * No 3D engine and no new package.
 *
 * Decorative only: hidden from screen readers, and it takes no touches.
 * Under reduced motion everything is drawn in place and nothing moves.
 */

export const HERO_SCENE_HEIGHT = 210;

/* ── The street's horizontal bands, top to bottom ──────────────────────── */

const H = HERO_SCENE_HEIGHT;
/** The building's front face stands on this line. */
const BASE = 152;
const BACK_WALK = { top: 148, bottom: 164, feet: 160 };
const ROAD = { top: 164, bottom: 196, farWheels: 179, nearWheels: 194, mid: 180 };
const FRONT_WALK = { top: 196, bottom: H, feet: 206 };

/* ── Oblique projection ────────────────────────────────────────────────── */

/** How far one unit of depth moves right and up on screen. */
const OBX = 0.6;
const OBY = 0.35;

type P3 = readonly [number, number, number];

/** `x` along the street, `y` into the picture from the building's front, `z` up. */
function at([x, y, z]: P3): [number, number] {
  return [x + y * OBX, BASE - z - y * OBY];
}

function pts(list: readonly P3[]): string {
  return list.map((p) => at(p).map((n) => n.toFixed(1)).join(',')).join(' ');
}

/* ── Colour ────────────────────────────────────────────────────────────── */

function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0'))
    .join('')}`;
}

type Shade = { top: string; front: string; side: string };

/** Roof palest, front lit, side in shade. */
function shadeOf(base: string): Shade {
  return { top: mix(base, '#FFFFFF', 0.5), front: mix(base, '#FFFFFF', 0.16), side: mix(base, '#000000', 0.12) };
}

/* ── Primitives ────────────────────────────────────────────────────────── */

/** A polygon's points, or `circle:cx,cy,r` for the round things (leaves). */
type Face = { points: string; fill: string; opacity?: number };

/** The three faces of a box that face the viewer: side, roof, front. */
function box(x: number, y: number, z: number, w: number, d: number, h: number, shade: Shade): Face[] {
  return [
    { points: pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]), fill: shade.side },
    { points: pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]), fill: shade.top },
    { points: pts([[x, y, z], [x + w, y, z], [x + w, y, z + h], [x, y, z + h]]), fill: shade.front },
  ];
}

/** A rectangle on a front face (the plane y = `y`). */
function onFront(y: number, u: number, v: number, w: number, h: number): string {
  return pts([[u, y, v], [u + w, y, v], [u + w, y, v + h], [u, y, v + h]]);
}

/** A rectangle on a side face (the plane x = `x`), `u` measured into depth. */
function onSide(x: number, u: number, v: number, w: number, h: number): string {
  return pts([[x, u, v], [x, u + w, v], [x, u + w, v + h], [x, u, v + h]]);
}

type Win = { points: string; lit: boolean; twinkles: boolean };

/** Which windows are on, chosen once so the pattern never jumps. */
function windows(list: readonly string[], offset = 0): Win[] {
  return list.map((points, i) => ({
    points,
    lit: (i + offset) % 5 !== 2,
    twinkles: (i + offset) % 4 === 1,
  }));
}

type Scene = { back: Face[]; wins: Win[]; front: Face[]; doorX: number };

/** Every building is this deep. */
const DEPTH = 30;
/** Space between the building's side and the hero's right edge. */
const RIGHT_MARGIN = 14;

/* ── The five buildings ────────────────────────────────────────────────── */

function sceneFor(category: StayCategory, colors: ThemeColors, width: number): Scene {
  const mark = colors.category[category].mark;
  const wall = shadeOf(mix(mark, '#FFFFFF', 0.38));
  const brand = shadeOf('#0E6E5C');
  const yellow = shadeOf('#FCDD44');
  const door = mix(mark, '#000000', 0.35);
  /* Right-aligned: the front's left edge, given the front width `w`. */
  const left = (w: number) => width - RIGHT_MARGIN - w - DEPTH * OBX;

  switch (category) {
    case 'PG_HOSTEL': {
      const w = 72;
      const x = left(w);
      const h = 118;
      const front: string[] = [];
      const side: string[] = [];
      for (let floor = 1; floor <= 4; floor += 1) {
        const v = floor * 22 + 5;
        for (const u of [8, 31.5, 55]) front.push(onFront(0, x + u, v, 9, 12));
        for (const u of [6, 18]) side.push(onSide(x + w, u, v, 7, 12));
      }
      front.push(onFront(0, x + 8, 5, 10, 12), onFront(0, x + 54, 5, 10, 12));
      side.push(onSide(x + w, 10, 5, 8, 12));
      const tank = shadeOf('#8FA3AE');
      return {
        back: [
          ...box(x, 0, 0, w, DEPTH, h, wall),
          { points: onFront(0, x, h - 9, w, 4), fill: brand.front },
          { points: onSide(x + w, 0, h - 9, DEPTH, 4), fill: brand.side },
          { points: onFront(0, x + w / 2 - 6, 0, 12, 18), fill: door },
        ],
        wins: windows([...front, ...side]),
        front: [...box(x + 40, 10, h, 18, 12, 12, tank), ...box(x + 46, 14, h + 12, 4, 4, 4, tank)],
        doorX: x + w / 2,
      };
    }

    case 'BACHELOR': {
      const w = 88;
      const x = left(w);
      const h = 94;
      const front: string[] = [];
      const side: string[] = [];
      for (let floor = 0; floor <= 3; floor += 1) {
        const v = floor * 23 + 6;
        /* The ground floor gives its middle two windows to the door. */
        for (const u of floor === 0 ? [8, 70] : [8, 28.5, 49, 70]) front.push(onFront(0, x + u, v, 10, 12));
        side.push(onSide(x + w, 10, v, 9, 12));
      }
      const balconies: Face[] = [];
      for (let floor = 1; floor <= 3; floor += 1) {
        balconies.push(
          ...box(x + 4, -5, floor * 23, w - 8, 5, 2, shadeOf(mix(mark, '#FFFFFF', 0.6))),
          { points: onFront(-5, x + 4, floor * 23 + 2, w - 8, 3.5), fill: brand.front, opacity: 0.85 },
        );
      }
      const pot = shadeOf('#B9784E');
      const leaf = mix(colors.brand, '#FFFFFF', 0.15);
      const [cx, cy] = at([x + w - 20, 15, h + 14]);
      return {
        back: [...box(x, 0, 0, w, DEPTH, h, wall), { points: onFront(0, x + w / 2 - 7, 0, 14, 19), fill: door }],
        wins: windows([...front, ...side], 1),
        front: [...balconies, ...box(x + w - 25, 12, h, 10, 7, 7, pot), { points: `circle:${cx},${cy},8`, fill: leaf }],
        doorX: x + w / 2,
      };
    }

    case 'COLIVE': {
      const w = 84;
      const x = left(w);
      const top = 60;
      const r = 30;
      const roof = shadeOf(mix(mark, '#000000', 0.15));
      const leaf = mix(colors.brand, '#FFFFFF', 0.1);
      const [tx, ty] = at([x - 14, 4, 40]);
      return {
        back: [
          /* The tree stands behind the house's left corner. */
          ...box(x - 16, 4, 0, 4, 2, 30, shadeOf('#8A6038')),
          { points: `circle:${tx},${ty},15`, fill: leaf },
          { points: `circle:${tx - 5},${ty - 5},6`, fill: mix(leaf, '#FFFFFF', 0.25) },
          ...box(x, 0, 0, w, DEPTH, top, wall),
          /* The chimney, then the roof slope that faces us, then the gable. */
          ...box(x + 56, 12, top, 9, 7, 28, shadeOf('#A0522D')),
          { points: pts([[x - 3, -3, top], [x + w + 3, -3, top], [x + w + 3, DEPTH / 2, top + r], [x - 3, DEPTH / 2, top + r]]), fill: roof.front },
          { points: pts([[x + w, 0, top], [x + w, DEPTH, top], [x + w, DEPTH / 2, top + r]]), fill: wall.side },
          { points: onFront(0, x + w / 2 - 7, 0, 14, 26), fill: door },
        ],
        wins: windows(
          [
            onFront(0, x + 10, 8, 14, 14),
            onFront(0, x + w - 24, 8, 14, 14),
            onFront(0, x + 10, 36, 14, 14),
            onFront(0, x + w / 2 - 7, 36, 14, 14),
            onFront(0, x + w - 24, 36, 14, 14),
            onSide(x + w, 10, 10, 10, 13),
            onSide(x + w, 10, 37, 10, 13),
          ],
          2,
        ),
        front: [],
        doorX: x + w / 2,
      };
    }

    case 'HOTEL': {
      const w = 68;
      const x = left(w);
      const h = 126;
      const front: string[] = [];
      const side: string[] = [];
      for (let floor = 1; floor <= 5; floor += 1) {
        const v = floor * 20 + 6;
        for (const u of [8, 29.5, 51]) front.push(onFront(0, x + u, v, 9, 11));
        for (const u of [6, 18]) side.push(onSide(x + w, u, v, 7, 11));
      }
      front.push(onFront(0, x + 8, 2, w - 16, 16));
      return {
        back: [...box(x, 0, 0, w, DEPTH, h, wall)],
        wins: windows([...front, ...side], 3),
        front: [
          ...box(x + 10, -10, 18, w - 20, 10, 3, brand),
          /* The rooftop sign, and the H on it. */
          ...box(x + 18, 6, h, 32, 3, 16, yellow),
          { points: onFront(6, x + 28, h + 3, 2.6, 10), fill: brand.side },
          { points: onFront(6, x + 37.4, h + 3, 2.6, 10), fill: brand.side },
          { points: onFront(6, x + 28, h + 7, 12, 2.2), fill: brand.side },
        ],
        doorX: x + w / 2,
      };
    }

    case 'COMMERCIAL': {
      const w = 104;
      const x = left(w);
      const h = 60;
      const awning: Face[] = [];
      for (let i = 0; i < 9; i += 1) {
        const x0 = x + 4 + i * ((w - 8) / 9);
        const x1 = x0 + (w - 8) / 9;
        awning.push({
          points: pts([[x0, 0, 36], [x1, 0, 36], [x1, -9, 29], [x0, -9, 29]]),
          fill: i % 2 === 0 ? brand.front : '#FFFFFF',
        });
      }
      return {
        back: [...box(x, 0, 0, w, DEPTH, h, wall), { points: onFront(0, x + 66, 0, 18, 30), fill: door }],
        wins: windows(
          [
            onFront(0, x + 8, 4, 50, 24),
            onFront(0, x + 12, 42, 16, 11),
            onFront(0, x + 44, 42, 16, 11),
            onFront(0, x + 76, 42, 16, 11),
            onSide(x + w, 8, 10, 14, 14),
          ],
          0,
        ),
        front: [...awning, ...box(x + 10, -2, h, w - 20, 3, 15, yellow)],
        doorX: x + 75,
      };
    }
  }
}

/* ── Windows and faces ─────────────────────────────────────────────────── */

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

const LIT = '#FCDD44';

function Window({
  win,
  index,
  total,
  glass,
  lights,
  twinkle,
}: {
  win: Win;
  index: number;
  total: number;
  glass: string;
  lights: SharedValue<number>;
  twinkle: SharedValue<number>;
}) {
  const animatedProps = useAnimatedProps(() => {
    if (!win.lit) return { fillOpacity: 0 };
    /* Each window comes on in turn as `lights` runs 0 → 1. */
    const on = Math.min(1, Math.max(0, lights.value * (total + 1) - index));
    const flicker = win.twinkles ? 0.55 + 0.45 * twinkle.value : 1;
    return { fillOpacity: on * flicker };
  });
  return (
    <>
      <Polygon points={win.points} fill={glass} />
      <AnimatedPolygon points={win.points} fill={LIT} animatedProps={animatedProps} />
    </>
  );
}

function Faces({ faces }: { faces: readonly Face[] }) {
  return (
    <>
      {faces.map((face, i) => {
        if (face.points.startsWith('circle:')) {
          const [cx, cy, r] = face.points.slice(7).split(',').map(Number);
          return <Circle key={i} cx={cx} cy={cy} r={r} fill={face.fill} opacity={face.opacity} />;
        }
        return <Polygon key={i} points={face.points} fill={face.fill} opacity={face.opacity} />;
      })}
    </>
  );
}

/** One building. Keyed by category, so a change mounts a fresh one. */
function Building({
  category,
  scene,
  width,
  twinkle,
  still,
}: {
  category: StayCategory;
  scene: Scene;
  width: number;
  twinkle: SharedValue<number>;
  still: boolean;
}) {
  const { colors } = useTheme();
  const glass = mix(colors.category[category].mark, '#1E2B33', 0.6);
  const lights = useSharedValue(still ? 1 : 0);

  useEffect(() => {
    if (still) {
      lights.value = 1;
      return;
    }
    lights.value = 0;
    lights.value = withDelay(320, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
  }, [still, lights]);

  return (
    <Animated.View
      style={StyleSheet.absoluteFill}
      entering={still ? undefined : FadeInDown.springify().damping(13).mass(0.8)}
      exiting={still ? undefined : FadeOut.duration(160)}
    >
      <Svg width={width} height={H}>
        <Faces faces={scene.back} />
        {scene.wins.map((win, i) => (
          <Window key={i} win={win} index={i} total={scene.wins.length} glass={glass} lights={lights} twinkle={twinkle} />
        ))}
        <Faces faces={scene.front} />
      </Svg>
    </Animated.View>
  );
}

/* ── The people and the traffic, all drawn facing right ────────────────── */

/** People and vehicles are drawn at this multiple of their artwork. */
const SPRITE = 1.3;

/** A sprite's box at `SPRITE` scale. */
function sized(width: number, height: number) {
  return { width: width * SPRITE, height: height * SPRITE };
}

const SKIN = '#E8B98F';
const HAIR = '#2E2A26';
const TYRE = '#22262B';

function Person({ shirt, pants = '#2E3440', bag }: { shirt: string; pants?: string; bag?: string }) {
  return (
    <Svg width={10 * SPRITE} height={20 * SPRITE} viewBox="0 0 10 20">
      <Rect x={3} y={12} width={1.7} height={8} fill={pants} />
      <Rect x={5.3} y={12} width={1.7} height={8} fill={mix(pants, '#FFFFFF', 0.12)} />
      {bag ? <Rect x={0.4} y={6} width={3.2} height={6.5} rx={1.2} fill={bag} /> : null}
      <Rect x={2.5} y={5.8} width={5} height={7} rx={1.6} fill={shirt} />
      <Circle cx={5} cy={3.3} r={2.7} fill={SKIN} />
      <Rect x={2.3} y={0.3} width={5.4} height={2.2} rx={1.1} fill={HAIR} />
    </Svg>
  );
}

function Car({ color }: { color: string }) {
  return (
    <Svg width={38 * SPRITE} height={19 * SPRITE} viewBox="0 0 38 19">
      <Polygon points="9,8.5 13,2.5 26,2.5 31,8.5" fill={mix(color, '#FFFFFF', 0.15)} />
      <Polygon points="11.2,8.5 14,3.8 19,3.8 19,8.5" fill="#CFE6F2" />
      <Polygon points="20.5,8.5 20.5,3.8 25.4,3.8 28.8,8.5" fill="#CFE6F2" />
      <Rect x={1} y={8} width={36} height={7.5} rx={3} fill={color} />
      <Rect x={34.4} y={9.6} width={2.6} height={2} rx={0.6} fill={LIT} />
      <Rect x={1} y={9.6} width={1.8} height={2} rx={0.6} fill="#E2584D" />
      <Circle cx={10} cy={15.5} r={3.2} fill={TYRE} />
      <Circle cx={10} cy={15.5} r={1.2} fill="#AEB6BD" />
      <Circle cx={29} cy={15.5} r={3.2} fill={TYRE} />
      <Circle cx={29} cy={15.5} r={1.2} fill="#AEB6BD" />
    </Svg>
  );
}

/** The green-and-yellow three-wheeler every Hyderabad street has. */
function Auto() {
  return (
    <Svg width={30 * SPRITE} height={22 * SPRITE} viewBox="0 0 30 22">
      <Rect x={3} y={1.5} width={23} height={9} rx={4.5} fill="#F2C318" />
      <Rect x={21} y={4} width={5} height={6.5} rx={1} fill="#CFE6F2" />
      <Circle cx={18} cy={7} r={2} fill={SKIN} />
      <Rect x={2} y={9.5} width={26} height={8} rx={3} fill="#2F8F4E" />
      <Circle cx={7} cy={18.5} r={3} fill={TYRE} />
      <Circle cx={24} cy={18.5} r={3} fill={TYRE} />
    </Svg>
  );
}

function Scooter({ shirt, helmet }: { shirt: string; helmet: string }) {
  return (
    <Svg width={26 * SPRITE} height={24 * SPRITE} viewBox="0 0 26 24">
      <Rect x={10} y={7} width={5} height={8} rx={1.6} fill={shirt} />
      <Circle cx={13} cy={4.2} r={3.2} fill={helmet} />
      <Polygon points="4,14 18,14 21.5,9 24,9 24,12.5 20.5,18 4,18" fill="#E2584D" />
      <Line x1={12.5} y1={14.5} x2={15} y2={18} stroke="#2E3440" strokeWidth={1.6} />
      <Circle cx={6} cy={20.5} r={3.2} fill={TYRE} />
      <Circle cx={20.5} cy={20.5} r={3.2} fill={TYRE} />
    </Svg>
  );
}

/** A student on a bicycle, bag on their back. */
function Bicycle({ shirt, bag }: { shirt: string; bag: string }) {
  return (
    <Svg width={26 * SPRITE} height={26 * SPRITE} viewBox="0 0 26 26">
      <Circle cx={6} cy={20.5} r={4.5} fill="none" stroke="#2E3440" strokeWidth={1.4} />
      <Circle cx={20} cy={20.5} r={4.5} fill="none" stroke="#2E3440" strokeWidth={1.4} />
      <Polygon points="6,20.5 12,14 20,20.5 12.6,20.5" fill="none" stroke="#0E6E5C" strokeWidth={1.4} />
      <Line x1={12} y1={14} x2={18.5} y2={12.5} stroke="#0E6E5C" strokeWidth={1.4} />
      <Line x1={12.5} y1={13.5} x2={12.5} y2={20} stroke="#2E3440" strokeWidth={1.6} />
      <Rect x={7.6} y={6.5} width={3.2} height={6} rx={1.2} fill={bag} />
      <Rect x={10.2} y={6} width={5} height={8} rx={1.6} fill={shirt} />
      <Circle cx={13.4} cy={3.4} r={2.7} fill={SKIN} />
      <Rect x={10.8} y={0.4} width={5.3} height={2.1} rx={1} fill={HAIR} />
    </Svg>
  );
}

/** A loop from 0 to 1 that starts after `delay` and repeats forever. */
function useLoop(duration: number, delay: number, still: boolean, at = 0.4) {
  const t = useSharedValue(still ? at : 0);
  useEffect(() => {
    if (still) {
      cancelAnimation(t);
      t.value = at;
      return;
    }
    t.value = 0;
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [duration, delay, still, at, t]);
  return t;
}

type Mover = {
  key: string;
  node: React.ReactNode;
  size: { width: number; height: number };
  /** Where its feet or wheels touch the ground. */
  ground: number;
  leftward: boolean;
  duration: number;
  delay: number;
  /** A walker's step; vehicles glide. */
  walks: boolean;
  /** Where it stands under reduced motion, 0 to 1 across the street. */
  still: number;
};

/** Something crossing the whole street, edge to edge, then round again. */
function Crossing({ mover, width, still }: { mover: Mover; width: number; still: boolean }) {
  const t = useLoop(mover.duration, mover.delay, still, mover.still);
  const span = width + mover.size.width * 2;

  const style = useAnimatedStyle(() => {
    const p = mover.leftward ? 1 - t.value : t.value;
    const x = -mover.size.width + p * span;
    const steps = (t.value * mover.duration) / 1000;
    const bob = mover.walks && !still ? Math.abs(Math.sin(steps * Math.PI * 2.2)) * 1.2 : 0;
    return {
      opacity: !still && t.value === 0 ? 0 : 1,
      transform: [
        { translateX: x },
        { translateY: mover.ground - mover.size.height - bob },
        { scaleX: mover.leftward ? -1 : 1 },
      ],
    };
  });

  return <Animated.View style={[styles.mover, mover.size, style]}>{mover.node}</Animated.View>;
}

type Visitor = { key: string; shirt: string; bag?: string; fromRight: boolean; duration: number; delay: number };

/* Students heading in: they walk to the door, stop, and go inside. */
const VISITORS: readonly Visitor[] = [
  { key: 'v1', shirt: '#3D7BD9', bag: '#E2584D', fromRight: false, duration: 9000, delay: 400 },
  { key: 'v2', shirt: '#0E6E5C', bag: '#F2C318', fromRight: false, duration: 10500, delay: 5200 },
  { key: 'v3', shirt: '#8E5BB5', bag: '#2E3440', fromRight: true, duration: 6000, delay: 2600 },
];

/** Share of a visitor's loop spent walking, then standing at the door. */
const WALK_END = 0.72;
const PAUSE_END = 0.82;

function Visiting({ visitor, doorX, width, still }: { visitor: Visitor; doorX: number; width: number; still: boolean }) {
  const t = useLoop(visitor.duration, visitor.delay, still, 0.5);
  const startX = visitor.fromRight ? width + 12 : -12;

  const style = useAnimatedStyle(() => {
    const v = t.value;
    let x: number;
    let lift = 0;
    let fade = 1;
    let scale = 1;
    if (v < WALK_END) {
      x = startX + (doorX - startX) * (v / WALK_END);
    } else if (v < PAUSE_END) {
      x = doorX;
    } else {
      /* In through the door: up the step, a little smaller, gone. */
      const k = (v - PAUSE_END) / (1 - PAUSE_END);
      x = doorX;
      lift = k * 7;
      scale = 1 - k * 0.15;
      fade = 1 - k;
    }
    const walking = v < WALK_END && !still;
    const bob = walking ? Math.abs(Math.sin(((v * visitor.duration) / 1000) * Math.PI * 2.2)) * 1.2 : 0;
    /* Facing the way they walk, then the door. */
    const facing = v < WALK_END && visitor.fromRight ? -1 : 1;
    return {
      opacity: still ? 1 : v === 0 ? 0 : fade,
      transform: [
        { translateX: x - 5 * SPRITE },
        { translateY: BACK_WALK.feet - 20 * SPRITE - lift - bob },
        { scaleX: facing * scale },
        { scaleY: scale },
      ],
    };
  });

  return (
    <Animated.View style={[styles.mover, sized(10, 20), style]}>
      <Person shirt={visitor.shirt} bag={visitor.bag} />
    </Animated.View>
  );
}

/** A four-point sparkle that breathes. */
function Sparkle({ style, phase, size, still }: { style: ViewStyle; phase: SharedValue<number>; size: number; still: boolean }) {
  const animated = useAnimatedStyle(() => ({
    opacity: still ? 0.8 : 0.3 + 0.7 * phase.value,
    transform: [{ scale: still ? 1 : 0.6 + 0.4 * phase.value }, { rotate: `${phase.value * 45}deg` }],
  }));
  const h = size / 2;
  const n = size * 0.14;
  return (
    <Animated.View style={[styles.abs, style, animated]}>
      <Svg width={size} height={size}>
        <Polygon points={`${h},0 ${h + n},${h - n} ${size},${h} ${h + n},${h + n} ${h},${size} ${h - n},${h + n} 0,${h} ${h - n},${h - n}`} fill={LIT} />
      </Svg>
    </Animated.View>
  );
}

/* ── The scene ─────────────────────────────────────────────────────────── */

export type HeroScene3DProps = {
  category: StayCategory;
  /** The whole hero's width — the road runs edge to edge. */
  width: number;
  style?: ViewStyle;
};

export function HeroScene3D({ category, width, style }: HeroScene3DProps) {
  const { colors, mode } = useTheme();
  const still = useReduceMotion();
  const dark = mode === 'dark';
  const scene = useMemo(() => sceneFor(category, colors, width), [category, colors, width]);

  const twinkle = useSharedValue(1);
  const drift = useSharedValue(0);
  const sparkA = useSharedValue(0.5);
  const sparkB = useSharedValue(0.5);

  useEffect(() => {
    const all = [twinkle, drift, sparkA, sparkB];
    if (still) {
      all.forEach((value) => cancelAnimation(value));
      twinkle.value = 1;
      return;
    }
    const breathe = (ms: number) => withRepeat(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }), -1, true);
    twinkle.value = 0;
    twinkle.value = breathe(1400);
    sparkA.value = 0;
    sparkA.value = breathe(1700);
    sparkB.value = 0;
    sparkB.value = withDelay(800, breathe(2100));
    drift.value = 0;
    drift.value = withRepeat(withTiming(1, { duration: 22000, easing: Easing.linear }), -1, false);
    return () => all.forEach((value) => cancelAnimation(value));
  }, [still, twinkle, drift, sparkA, sparkB]);

  const cloudStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.min(drift.value, 1 - drift.value) * 6) * (dark ? 0.35 : 0.9),
    transform: [{ translateX: -40 + drift.value * (width + 80) }],
  }));

  /* Speeds are per lane, so nothing in a lane ever catches what is ahead. */
  const far = (width + 80) / 70;
  const near = (width + 80) / 95;
  const movers: Mover[] = useMemo(
    () => [
      { key: 'auto', node: <Auto />, size: sized(30, 22), ground: ROAD.farWheels + 2.5 * SPRITE, leftward: true, duration: far * 1000, delay: 0, walks: false, still: 0.25 },
      { key: 'carR', node: <Car color="#E2584D" />, size: sized(38, 19), ground: ROAD.farWheels + 2 * SPRITE, leftward: true, duration: far * 1000, delay: far * 520, walks: false, still: 0.7 },
      { key: 'carB', node: <Car color="#3D7BD9" />, size: sized(38, 19), ground: ROAD.nearWheels + 2 * SPRITE, leftward: false, duration: near * 1000, delay: 900, walks: false, still: 0.15 },
      { key: 'scooter', node: <Scooter shirt="#0E6E5C" helmet="#FCDD44" />, size: sized(26, 24), ground: ROAD.nearWheels + 3.5 * SPRITE, leftward: false, duration: near * 1000, delay: near * 400 + 900, walks: false, still: 0.5 },
      { key: 'bike', node: <Bicycle shirt="#8E5BB5" bag="#F2C318" />, size: sized(26, 26), ground: ROAD.nearWheels + 4 * SPRITE, leftward: false, duration: near * 1000, delay: near * 760 + 900, walks: false, still: 0.8 },
      { key: 'walkerA', node: <Person shirt="#F08A3C" bag="#3D7BD9" />, size: sized(10, 20), ground: FRONT_WALK.feet, leftward: false, duration: (width + 40) * 55, delay: 1500, walks: true, still: 0.35 },
      { key: 'walkerB', node: <Person shirt="#2F6076" pants="#55524C" />, size: sized(10, 20), ground: FRONT_WALK.feet, leftward: true, duration: (width + 40) * 62, delay: 6000, walks: true, still: 0.62 },
    ],
    [far, near, width],
  );
  const vehicles = movers.filter((mover) => !mover.walks);
  const walkers = movers.filter((mover) => mover.walks);

  /* The street. */
  const paving = dark ? '#3A3F44' : '#E6E0D3';
  const kerb = dark ? '#59626B' : '#C9CFD4';
  const asphalt = dark ? '#33393F' : '#5E6973';
  const skyline = dark ? '#1F2A27' : mix(colors.brand, '#FFFFFF', 0.82);
  const skylineWin = dark ? '#2C3A36' : mix(colors.brand, '#FFFFFF', 0.68);
  const tree = mix(colors.brand, '#FFFFFF', dark ? 0.25 : 0.35);

  /* A low skyline behind the street on the left, below the headline. */
  const towers: { x: number; w: number; h: number }[] = [];
  for (let x = 6, i = 0; x < width - 170; i += 1) {
    const w = 26 + ((i * 13) % 18);
    const h = 30 + ((i * 23) % 28);
    towers.push({ x, w, h });
    x += w + 6 + ((i * 7) % 10);
  }
  const dashes: number[] = [];
  for (let x = 6; x < width; x += 22) dashes.push(x);

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[{ width, height: H }, style]}
    >
      <Animated.View style={[styles.abs, { top: 14 }, cloudStyle]}>
        <Svg width={40} height={16}>
          <Ellipse cx={13} cy={10} rx={12} ry={6} fill="#FFFFFF" />
          <Ellipse cx={25} cy={8} rx={12} ry={8} fill="#FFFFFF" />
        </Svg>
      </Animated.View>

      <View style={StyleSheet.absoluteFill}>
        <Svg width={width} height={H}>
          {towers.map((tower, i) => (
            <React.Fragment key={i}>
              <Rect x={tower.x} y={BACK_WALK.top - tower.h} width={tower.w} height={tower.h} rx={2} fill={skyline} />
              {Array.from({ length: Math.floor((tower.h - 8) / 10) }, (_, row) => (
                <Rect key={row} x={tower.x + 5} y={BACK_WALK.top - tower.h + 6 + row * 10} width={tower.w - 10} height={3.5} rx={1} fill={skylineWin} />
              ))}
            </React.Fragment>
          ))}
          {/* Street trees along the back pavement. */}
          {[0.14, 0.42].map((share, i) => {
            const x = width * share;
            return (
              <React.Fragment key={`t${i}`}>
                <Rect x={x - 1.5} y={BACK_WALK.top - 14} width={3} height={16} fill="#8A6038" />
                <Circle cx={x} cy={BACK_WALK.top - 20} r={10} fill={tree} />
                <Circle cx={x - 3} cy={BACK_WALK.top - 23} r={4} fill={mix(tree, '#FFFFFF', 0.25)} />
              </React.Fragment>
            );
          })}

          <Rect x={0} y={BACK_WALK.top} width={width} height={BACK_WALK.bottom - BACK_WALK.top} fill={paving} />
          <Rect x={0} y={ROAD.top - 2} width={width} height={2} fill={kerb} />
          <Rect x={0} y={ROAD.top} width={width} height={ROAD.bottom - ROAD.top} fill={asphalt} />
          {dashes.map((x) => (
            <Rect key={x} x={x} y={ROAD.mid - 1} width={11} height={2} rx={1} fill="#FFFFFF" opacity={0.85} />
          ))}
          <Rect x={0} y={ROAD.bottom} width={width} height={2} fill={kerb} />
          <Rect x={0} y={FRONT_WALK.top + 2} width={width} height={FRONT_WALK.bottom - FRONT_WALK.top} fill={paving} />
          {/* The building's shadow on the pavement. */}
          <Ellipse cx={scene.doorX + 10} cy={BASE + 4} rx={70} ry={7} fill="#000000" opacity={0.1} />
        </Svg>
      </View>

      <Building key={category} category={category} scene={scene} width={width} twinkle={twinkle} still={still} />

      {/* Back to front: the back pavement, the far lane, the near lane, the
          front pavement — so a car always passes in front of the people
          behind it. */}
      {VISITORS.map((visitor) => (
        <Visiting key={`${category}-${visitor.key}`} visitor={visitor} doorX={scene.doorX} width={width} still={still} />
      ))}
      {vehicles.map((mover) => (
        <Crossing key={mover.key} mover={mover} width={width} still={still} />
      ))}
      {walkers.map((mover) => (
        <Crossing key={mover.key} mover={mover} width={width} still={still} />
      ))}

      <Sparkle style={{ top: 18, right: 22 }} phase={sparkA} size={12} still={still} />
      <Sparkle style={{ top: 70, right: 150 }} phase={sparkB} size={9} still={still} />
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  mover: { position: 'absolute', left: 0, top: 0 },
});
