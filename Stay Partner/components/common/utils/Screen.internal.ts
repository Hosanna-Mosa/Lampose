/* Private helpers and shared types from the old components/ui/Screen.tsx.
 * §4: utils holds style helpers, formatters and colour maps. */
import type { ReactNode } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { layout } from '@/constants/layout';

export type ScreenProps = {
  children: ReactNode;
  /** Scrolls the body. Turn off for chat threads and other custom-scroll layouts. */
  scroll?: boolean;
  /** Applies the 20px screen margin. */
  padded?: boolean;
  /** Overrides the side margin. Auth and wizard screens use 24 rather than 20. */
  padX?: number;
  /**
   * Self-contained chrome pinned above the scroll — this is `TopHeader`'s slot.
   * It owns its own safe-area inset, background and border, so it is rendered
   * raw.
   */
  header?: ReactNode;
  /**
   * A pinned header made of ordinary screen content — a back chevron, a title,
   * an action or two.
   *
   * Separate from `header` because the two need opposite treatment. `TopHeader`
   * is finished chrome and is rendered untouched; this is body JSX that happens
   * to belong at the top, so `Screen` gives it the safe-area inset, the side
   * margin and the background that the scrolling body would otherwise have
   * given it.
   *
   * It exists because almost every screen in this app had its title and back
   * button as the FIRST CHILDREN of the scroll view, which meant they scrolled
   * away — you lost the way back the moment you moved down a list. Moving that
   * JSX into this prop is the whole fix, and it keeps the padding and inset
   * maths in one place rather than re-derived per screen.
   */
  stickyHeader?: ReactNode;
  /** Pinned to the bottom above the safe area — primary actions in wizards and forms. */
  footer?: ReactNode;
  /** Add bottom room for the tab bar. Screens inside (tabs) want this. */
  tabBarSpacing?: boolean;
  background?: 'bg' | 'surface';
  contentStyle?: ViewStyle;
  /**
   * Pull-to-refresh, on the scrolling body.
   *
   * Both optional and both-or-neither: passing `onRefresh` without `refreshing`
   * would leave the spinner unable to say when the reload actually finished,
   * so nothing is wired unless the caller has a real boolean to report — a
   * screen with no data to reload should not draw a control that does
   * nothing. `scroll={false}` screens are not given one; a pull gesture on a
   * fixed layout has nothing to release into.
   */
  refreshing?: boolean;
  onRefresh?: () => void;
};

/**
 * Screen chrome: background, safe-area handling, and the 20px side margin.
 * Every screen goes through this so bottom safe-area padding stays consistent
 * once the tab bar is in play.
 */

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { paddingHorizontal: layout.screenX },
  /* No border by default. Most of these headers are a chevron and a title on
     the same ground as the body, and a hairline under them would draw a line
     across a screen the design does not divide. A screen that wants one adds
     it to its own header JSX. */
  stickyHeader: { paddingBottom: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  headerSide: {
    width: 44,
    justifyContent: 'center',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: layout.screenX,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
