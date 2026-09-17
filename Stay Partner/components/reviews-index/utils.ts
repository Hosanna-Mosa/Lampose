/*
 * Helpers and types belonging to app/reviews/index.tsx, used by the components
 * extracted from it. §4: "shared helpers to its utils".
 */


export const STARS = [5, 4, 3, 2, 1] as const;

export function toneFor(name: string): 'accent' | 'success' | 'info' {
  const tones = ['accent', 'success', 'info'] as const;
  const sum = [...name].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return tones[sum % tones.length];
}
