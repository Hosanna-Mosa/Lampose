/**
 * The same colour, at a different alpha.
 *
 * ## Why this exists
 *
 * Fades were written as `['rgba(0,0,0,0)', colors.bg]` — transparent *black*
 * on one end, the theme's ground on the other. That reads as correct and is
 * not: both `LinearGradient` and Reanimated's `interpolateColor` walk the RGB
 * channels independently, so the midpoint of that fade is a half-strength
 * black mixed toward the ground. On a light theme the result is a grey haze
 * across the middle of every fade, and on a photo header it looks like the
 * image has been dirtied.
 *
 * The fix is to keep the channels constant and move only the alpha, which is
 * what this does: `withAlpha(colors.bg, 0)` is the same colour as `colors.bg`
 * and simply invisible, so nothing is being mixed in on the way.
 *
 * Accepts the `#RRGGBB` form the palette is written in. Anything else is
 * returned untouched rather than throwing — a fade is not worth a crash.
 *
 * ## JS thread only
 *
 * This is not a worklet. Calling it inside `useAnimatedStyle` or any other
 * Reanimated worklet throws `withAlpha is not a function (it is Object)`: the
 * UI runtime cannot reach a plain imported function, so it receives the module
 * object instead. Resolve the colour in the component body and let the worklet
 * capture the resulting string — which is also cheaper, because a theme colour
 * does not change between frames and has no business being recomputed in one.
 */
export function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;

  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const clamped = Math.max(0, Math.min(1, alpha));

  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}
