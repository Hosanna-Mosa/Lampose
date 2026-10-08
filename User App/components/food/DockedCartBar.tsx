import React from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Icon, Text } from '@/components/ui';
import { EMBER } from '@/components/shell/TabBar';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { withAlpha } from '@/utils/color';
import { formatRupees } from '@/utils/money';

import { FoodPhoto } from './FoodMarks';

/** How many dish photos the strip shows before it says "+n". */
const MAX_PHOTOS = 3;
const PHOTO = 38;

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
 *
 * The dishes in the cart lead it, as up to three small photos.
 *
 * Drawn in Food's burnt orange (`EMBER`, the same as the Food tab bar's), so
 * the strip that turns up after the first add reads as part of Food. Its
 * type is white; the action pill inverts it, white with orange type.
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
  const { space, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  /* What is in the cart, as pictures: one per dish that has a photo, never a
     placeholder — a striped well says nothing about dinner. */
  const { lines } = useFood();
  const photos = [...new Set(lines.map((line) => line.dish.photo).filter((uri): uri is string => !!uri))];
  const shown = photos.slice(0, MAX_PHOTOS);
  const more = photos.length - shown.length;

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
            backgroundColor: EMBER.base,
            opacity: pressed ? 0.88 : 1,
            borderRadius: radius.button + 2,
            paddingLeft: space[4],
            paddingRight: space[3],
            paddingVertical: space[3],
            gap: space[3],
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 10,
            elevation: 8,
          },
        ]}
      >
        {shown.length ? (
          <View style={styles.photos}>
            {shown.map((uri, index) => (
              <View
                key={uri}
                style={[
                  styles.photo,
                  { borderRadius: radius.chip + 2, marginLeft: index === 0 ? 0 : -PHOTO / 2.6, zIndex: MAX_PHOTOS - index },
                ]}
              >
                <FoodPhoto height={PHOTO - 4} width={PHOTO - 4} radius={radius.chip} uri={uri} />
              </View>
            ))}
            {more > 0 ? (
              <View style={[styles.photo, styles.more, { borderRadius: radius.chip + 2, marginLeft: -PHOTO / 2.6 }]}>
                <Text variant="numMeta" style={{ color: EMBER.base, fontWeight: '700' }}>
                  +{more}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="priceMd" style={{ color: EMBER.on, fontWeight: '700' }}>
            {count} {count === 1 ? 'item' : 'items'} · {formatRupees(total)}
          </Text>
          <Text variant="caption" style={{ color: withAlpha(EMBER.on, 0.8), marginTop: 2 }} numberOfLines={1}>
            {context}
          </Text>
        </View>

        <View
          style={[
            styles.action,
            {
              backgroundColor: EMBER.on,
              borderRadius: radius.pill,
              paddingHorizontal: space[3] + 2,
            },
          ]}
        >
          <Text variant="title3" style={{ color: EMBER.base, fontWeight: '700', fontSize: 13 }}>
            {label}
          </Text>
          <Icon name="arrowRight" size={16} color={EMBER.base} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  photos: { flexDirection: 'row', alignItems: 'center' },
  /* A white frame, so overlapping photos keep their edges on the orange. */
  photo: {
    width: PHOTO,
    height: PHOTO,
    padding: 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: { backgroundColor: '#FFFFFF' },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 58 },
  action: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
});

