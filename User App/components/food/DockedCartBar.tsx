import React from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';

export type DockedCartBarProps = {
  count: number;
  total: number;
  /** "Lunch · Block C · Room 214" — the window and the target, always both. */
  context: string;
  label?: string;
  onPress: () => void;
  /** Reports its own height so the screen above can clear it. */
  onMeasure?: (height: number) => void;
  bottomInset?: number;
};

/**
 * The cart bar docked at the bottom of a menu.
 *
 * Deliberately still: no slide-in when the first item is added and no pulse
 * when the count changes. It simply appears and updates.
 */
export function DockedCartBar({
  count,
  total,
  context,
  label = 'View cart',
  onPress,
  onMeasure,
  bottomInset,
}: DockedCartBarProps) {
  const { colors, space, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();

  const measure = (event: LayoutChangeEvent) => onMeasure?.(event.nativeEvent.layout.height);

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    onPress();
  };

  return (
    <View
      onLayout={measure}
      style={{
        paddingHorizontal: layout.gutter,
        paddingBottom: (bottomInset ?? insets.bottom) + space[2],
      }}
    >
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${count} ${count === 1 ? 'item' : 'items'}, ${formatRupees(total)}. ${context}`}
        style={({ pressed }) => [
          styles.bar,
          {
            backgroundColor: pressed ? colors.graphiteRaised : colors.graphite,
            borderRadius: radius.button + 2,
            paddingLeft: space[4],
            paddingRight: space[3],
            paddingVertical: space[3],
            gap: space[3],
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 8,
          },
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="priceMd" style={{ color: colors.onGraphite, fontWeight: '700' }}>
            {count} {count === 1 ? 'item' : 'items'} · {formatRupees(total)}
          </Text>
          <Text variant="caption" style={{ color: colors.onGraphiteMuted, marginTop: 2 }} numberOfLines={1}>
            {context}
          </Text>
        </View>

        <View
          style={[
            styles.action,
            {
              backgroundColor: colors.onGraphite,
              borderRadius: radius.pill,
              paddingHorizontal: space[3] + 2,
            },
          ]}
        >
          <Text variant="title3" style={{ color: colors.graphite, fontWeight: '700', fontSize: 13 }}>
            {label}
          </Text>
          <Icon name="arrowRight" size={16} color={colors.graphite} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 58 },
  action: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
});

