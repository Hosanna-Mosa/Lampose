import type { TextStyle, ViewStyle } from 'react-native';

import { fonts } from '@/constants/typography';

/**
 * Style fragments written out in more than one place, gathered into one.
 *
 * §9's second pass: style duplication is the one a line-based scan misses
 * entirely, because the same object written in four stylesheets almost always
 * has its keys in a different order. It is usually the largest count and the
 * easiest win, because it collapses with **no change to what renders** — a
 * spread of a shared object produces exactly the object that was written out
 * by hand before.
 *
 * What is deliberately NOT here: `{ flex: 1 }`, `{ marginBottom: 16 }` and the
 * rest of the one-line tail. Those appear 49 and 12 times, and replacing a
 * one-line literal with an import buys indirection rather than clarity. A
 * fragment earns a name when the name says something the literal does not.
 */

/**
 * The back-button row above a screen's title.
 *
 * Twenty-six screens declare this, every one of them with the same three
 * properties and a different margin — eight distinct spellings of the same
 * intent. The margin stays at the call site because it genuinely differs per
 * screen; the part that never differs lives here:
 *
 *     backRow: { ...backRowBase, marginBottom: 2 }
 *
 * `height: 44` is the tap target, and `marginLeft: -10` pulls the icon's own
 * padding back so the chevron optically aligns with the title below it. Both
 * are decisions somebody made once and then copied twenty-five times.
 */
export const backRowBase: ViewStyle = {
  height: 44,
  justifyContent: 'center',
  marginLeft: -10,
};

/**
 * A full-bleed box that centres its child — the loading and empty states.
 *
 * Seven screens spell this out, mostly as `loading` or `centre`.
 */
export const centred: ViewStyle = {
  alignItems: 'center',
  flex: 1,
  justifyContent: 'center',
};

/**
 * Two type sizes that are missing from `constants/typography` and were
 * therefore written out by hand — the bold 15/20 nine times, the bold 14/18
 * six. They are here rather than in the type scale because adding them there
 * would change what that module means: these are local repairs to a gap, not
 * new steps in the scale, and moving them is a decision for whoever owns the
 * design system.
 */
export const boldBody: TextStyle = {
  fontFamily: fonts.bold,
  fontSize: 15,
  lineHeight: 20,
};

export const boldLabel: TextStyle = {
  fontFamily: fonts.bold,
  fontSize: 14,
  lineHeight: 18,
};
