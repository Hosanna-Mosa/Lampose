import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Text } from './Text';
import { IconButton } from './Button';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { layout } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

/**
 * Flat white header — back affordance, centred title, optional right action.
 * Never coloured, per the design system.
 */
export function TopHeader({
  title,
  showBack = false,
  onBack,
  right,
  bordered = true,
}: {
  title?: string;
  /** Shows the back chevron. Defaults to popping the stack unless `onBack` overrides it. */
  showBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  bordered?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top,
          height: layout.headerHeight + insets.top,
          backgroundColor: c.surface,
          borderBottomWidth: bordered ? 1 : 0,
          borderBottomColor: c.borderSubtle,
        },
      ]}
    >
      <View style={styles.headerSide}>
        {showBack ? (
          <IconButton name="chevron-left" label="Go back" onPress={onBack ?? (() => router.back())} />
        ) : null}
      </View>
      {title ? (
        <Text variant="headerTitle" numberOfLines={1} style={styles.headerTitle}>
          {title}
        </Text>
      ) : (
        <View style={styles.headerTitle} />
      )}
      <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
    </View>
  );
}

type ScreenProps = {
  children: ReactNode;
  /** Scrolls the body. Turn off for chat threads and other custom-scroll layouts. */
  scroll?: boolean;
  /** Applies the 20px screen margin. */
  padded?: boolean;
  /** Overrides the side margin. Auth and wizard screens use 24 rather than 20. */
  padX?: number;
  header?: ReactNode;
  /** Pinned to the bottom above the safe area — primary actions in wizards and forms. */
  footer?: ReactNode;
  /** Add bottom room for the tab bar. Screens inside (tabs) want this. */
  tabBarSpacing?: boolean;
  background?: 'bg' | 'surface';
  contentStyle?: ViewStyle;
};

/**
 * Screen chrome: background, safe-area handling, and the 20px side margin.
 * Every screen goes through this so bottom safe-area padding stays consistent
 * once the tab bar is in play.
 */
export function Screen({
  children,
  scroll = true,
  padded = true,
  padX,
  header,
  footer,
  tabBarSpacing = false,
  background = 'surface',
  contentStyle,
}: ScreenProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();

  const bg = background === 'bg' ? c.bg : c.surface;
  const bottomPad = tabBarSpacing ? layout.tabBarHeight + insets.bottom + 16 : insets.bottom + 24;

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

  return (
    <View style={[styles.flex, { backgroundColor: bg }]}>
      {header}
      {scroll ? (
        // Auto-scrolls a focused input above the keyboard — every form screen
        // gets this for free rather than each one re-solving it.
        <KeyboardAwareScrollViewCompat
          style={styles.flex}
          contentContainerStyle={{
            paddingTop: header ? 16 : insets.top + 16,
            paddingBottom: footer ? 16 : bottomPad,
          }}
          bottomOffset={footer ? 90 : 20}
          showsVerticalScrollIndicator={false}
        >
          {body(false)}
        </KeyboardAwareScrollViewCompat>
      ) : (
        <View
          style={[
            styles.flex,
            { paddingTop: header ? 16 : insets.top + 16, paddingBottom: footer ? 0 : bottomPad },
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
              paddingBottom: tabBarSpacing ? layout.tabBarHeight + insets.bottom + 12 : insets.bottom + 12,
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { paddingHorizontal: layout.screenX },
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
