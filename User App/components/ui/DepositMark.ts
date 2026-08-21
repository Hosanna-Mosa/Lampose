import type { TextStyle } from 'react-native';

import { useTheme } from '@/context/ThemeContext';

/**
 * The dotted caution-orange underline that means "this money comes back".
 *
 * The Batch 12 consistency audit put this at the top of its list, and it was
 * right to. Fourteen places hand-rolled the three declarations, one of them
 * without a colour — which means one screen rendered the mark in the text
 * colour and silently stopped meaning anything.
 *
 * It is not decoration. It is a **semantic mark**, the visual equivalent of the
 * word "refundable", and it appears on every deposit figure in the product. If
 * a deposit on the cost breakdown is marked and the identical figure on the
 * confirmation is not, a student has to work out whether those are two
 * different kinds of money. They are not, and they must never look like it.
 *
 * One function, so there is one place to change it and nowhere to forget it.
 */
export function useDepositMark(): TextStyle {
  const { colors, money } = useTheme();

  return {
    color: colors.warning.ink,
    textDecorationLine: 'underline',
    textDecorationStyle: money.depositUnderline.style,
    textDecorationColor: colors.warning.base,
  };
}
