import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { layout } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';
import { ScreenProps, styles } from '@/components/common/utils/Screen.internal';

export function Screen({
  children,
  scroll = true,
  padded = true,
  padX,
  header,
  stickyHeader,
  footer,
  tabBarSpacing = false,
  background = 'surface',
  contentStyle,
  refreshing,
  onRefresh,
}: ScreenProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();

  const bg = background === 'bg' ? c.bg : c.surface;
  /*
   * Who owns the band over the system navigation bar.
   *
   * Android draws edge-to-edge, so the navigation bar is transparent and the
   * app paints behind it. Padding the scroll CONTENT only guarantees the last
   * row clears the bar — the viewport still runs underneath, so everything
   * above the end visibly slides under the gesture bar while you scroll.
   *
   * So exactly one thing pads for it, and which one depends on what is pinned
   * to the bottom:
   *   footer        the footer does. It is opaque and sits over that band.
   *   tabBarSpacing the tab navigator's bar does, and it sits BELOW this
   *                 screen entirely — so `bottomPad` is end-of-scroll room,
   *                 not clearance for something painted on top.
   *   neither       the screen root does, which ends the viewport above the
   *                 bar and leaves a band of `bg` behind it. Nothing can be
   *                 painted there at any scroll position.
   */
  const rootBottomInset = footer || tabBarSpacing ? 0 : insets.bottom;
  const bottomPad = tabBarSpacing ? layout.tabBarHeight + insets.bottom + 16 : 24;

  /**
   * A non-scrolling screen fills the space it's given. Without this the wrapper
   * sizes to its content, so any `flex: 1` child — EmptyState, ErrorState —
   * resolves against a zero-height parent and renders nothing at all.
   * `contentStyle` still comes last, so a caller can override.
   */
  const body = (fill: boolean) => (
    <View
      style={[
        fill ? styles.flex : null,
        padded ? { paddingHorizontal: padX ?? layout.screenX } : null,
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  /* Either kind of pinned chrome means the body no longer owes the status bar
     its inset — the header above has already taken it. */
  const pinned = Boolean(header || stickyHeader);

  return (
    <View style={[styles.flex, { backgroundColor: bg, paddingBottom: rootBottomInset }]}>
      {header}

      {stickyHeader ? (
        <View
          style={[
            styles.stickyHeader,
            {
              paddingTop: insets.top,
              paddingHorizontal: padded ? padX ?? layout.screenX : 0,
              /* Opaque, and it has to be: this sits over a scrolling list, and
                 a transparent header would show rows sliding through the title. */
              backgroundColor: bg,
            },
          ]}
        >
          {stickyHeader}
        </View>
      ) : null}

      {scroll ? (
        // Auto-scrolls a focused input above the keyboard — every form screen
        // gets this for free rather than each one re-solving it.
        <KeyboardAwareScrollViewCompat
          style={styles.flex}
          contentContainerStyle={{
            paddingTop: pinned ? 16 : insets.top + 16,
            paddingBottom: footer ? 16 : bottomPad,
          }}
          bottomOffset={footer ? 90 : 20}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} />
            ) : undefined
          }
        >
          {body(false)}
        </KeyboardAwareScrollViewCompat>
      ) : (
        <View
          style={[
            styles.flex,
            { paddingTop: pinned ? 16 : insets.top + 16, paddingBottom: footer ? 0 : bottomPad },
          ]}
        >
          {body(true)}
        </View>
      )}
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: bg,
              borderTopColor: c.borderSubtle,
              /*
               * The tab bar is not paid for twice.
               *
               * `BottomTabBar` only goes `position: 'absolute'` when it is
               * HIDDEN — while it is visible the navigator lays it out BELOW
               * this screen and pays the bottom inset itself. Reserving its
               * height and that inset here reserved the same band a second
               * time, so the strip floated a whole tab bar's height above the
               * tab bar with a dead band of page beneath it. Inside tabs the
               * footer owes nothing but its own breathing room; outside them
               * it still owes the safe area, because nothing below it does.
               */
              paddingBottom: tabBarSpacing ? 12 : insets.bottom + 12,
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}
