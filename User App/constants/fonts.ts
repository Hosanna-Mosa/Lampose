import type { FontSource } from 'expo-font';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

/* ── THE APP'S TYPEFACE ────────────────────────────────────────────────────
   To change the font on every screen, stays and food alike: install the family
   (`npx expo install @expo-google-fonts/<family>`), swap this import, and
   point the four weights in `STAYS` below at the new files. That is the whole
   change — no other file names a font. */
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';

import type { TypeFace } from './tokens';

/**
 * EVERY FONT THE APP DRAWS WITH, IN ONE FILE.
 *
 * This is the only file that imports a font or knows a font's name. `Text`,
 * `TextField`, `SearchField`, `OtpInput` and the few raw inputs and animated
 * letters that cannot be a `Text` all get their family from `applyFont` or
 * `resolveFontFamily` here, so changing `STAYS` changes every letter on every
 * screen — stays and food — and nothing else has to be edited.
 *
 * The files are registered under the app's own names (`stays-400`,
 * `stays-700` …), never the font's, which is what lets a font be swapped
 * without a rename anywhere else. `npm run check:fonts` fails on any file that
 * goes around this one.
 */

export type FontWeight = 400 | 500 | 600 | 700;

const WEIGHTS: readonly FontWeight[] = [400, 500, 600, 700];

/**
 * One file per weight. React Native cannot synthesise a weight from a single
 * file without leaving the family on Android (see `applyFont`), so every weight
 * the scale uses is its own file.
 */
type FontFiles = Record<FontWeight, FontSource>;

/**
 * Every screen, every letter: headings, prose, prices and figures, on the stay
 * side and the food side.
 *
 * One family for all of it is the point — three faces meant a price sat in a
 * different typeface from the label above it and the total below it. Food was
 * the last module on three faces (Outfit, Source Sans 3, DM Mono) and is now
 * on this one too; it keeps only its own sizes — see `typeScale`. Whatever
 * replaces Manrope should, like it, be a UI face whose figures are close
 * enough to uniform width that a changing rent does not reflow its row.
 */
const STAYS: FontFiles = {
  400: Manrope_400Regular,
  500: Manrope_500Medium,
  600: Manrope_600SemiBold,
  700: Manrope_700Bold,
};

const FACES: Record<TypeFace, FontFiles> = { stays: STAYS };

/*
 * Each distinct file is registered once, under `<face>-<weight>` of the first
 * weight that uses it — so a file shared by two weights or two faces is not
 * fetched twice before the splash lifts.
 */
const registeredNames = new Map<FontSource, string>();
const familyNames = {} as Record<TypeFace, Record<FontWeight, string>>;

for (const face of Object.keys(FACES) as TypeFace[]) {
  familyNames[face] = {} as Record<FontWeight, string>;
  for (const weight of WEIGHTS) {
    const file = FACES[face][weight];
    let name = registeredNames.get(file);
    if (!name) {
      name = `${face}-${weight}`;
      registeredNames.set(file, name);
    }
    familyNames[face][weight] = name;
  }
}

/** What `useFonts` loads in `app/_layout.tsx` — the only place fonts load. */
export const fontAssets: Record<string, FontSource> = Object.fromEntries(
  Array.from(registeredNames, ([file, name]) => [name, file]),
);

/** The registered family for a face at a weight. */
export function resolveFontFamily(face: TypeFace, weight: FontWeight): string {
  return familyNames[face][weight];
}

const NAMED_WEIGHTS: Record<string, number> = {
  thin: 100,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  condensed: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  condensedBold: 700,
  heavy: 800,
  black: 900,
};

/** Any React Native `fontWeight` → the nearest weight a file exists for. */
function nearestWeight(weight: TextStyle['fontWeight'], fallback: FontWeight): FontWeight {
  if (weight === undefined) return fallback;
  const numeric = typeof weight === 'number' ? weight : (NAMED_WEIGHTS[weight] ?? Number(weight));
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric >= 700) return 700;
  if (numeric >= 600) return 600;
  if (numeric >= 500) return 500;
  return 400;
}

/**
 * The one rule for putting type on screen: the family comes from `face`, the
 * file from the weight the style asks for, and the style gets no other say.
 *
 * `fontWeight` and `fontStyle` are consumed rather than passed on because on
 * Android a font loaded by expo-font is registered for the regular style only.
 * React Native answers `fontWeight: '700'` or `fontStyle: 'italic'` on it by
 * drawing the SYSTEM font — Roboto Bold, Roboto Italic — not a bolder Manrope.
 * Turning the weight into the file for that weight is what keeps bold text in
 * the family. No italic file is loaded, so italic is dropped, which is what iOS
 * already did with it. A `fontFamily` in the style is overwritten: this file is
 * the only place a family is chosen.
 */
export function applyFont(
  face: TypeFace,
  style: StyleProp<TextStyle>,
  fallbackWeight: FontWeight = 400,
): TextStyle {
  const { fontWeight, fontStyle: _fontStyle, fontFamily: _fontFamily, ...rest } =
    StyleSheet.flatten(style) ?? {};
  return { ...rest, fontFamily: resolveFontFamily(face, nearestWeight(fontWeight, fallbackWeight)) };
}
