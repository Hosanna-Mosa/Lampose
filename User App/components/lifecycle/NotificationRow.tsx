import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { AppNotification, NotificationKind } from '@/types/support';
import type { IconName } from '@/components/ui';

/**
 * One alert.
 *
 * **Money notifications are typeset differently from activity ones.** A payment
 * landing, a refund arriving, rent falling due — those are the ones a student
 * scrolls back three weeks to find, usually to answer "when exactly did that
 * happen" for someone else. They must be findable by *shape*, so they carry a
 * tinted glyph tile where activity items carry a plain one. Scanning a list of
 * forty for the one about money should not require reading forty titles.
 *
 * **Unread is a left rule and a filled dot, never colour alone.** A student
 * with red-green colour blindness reading a phone in sunlight is the ordinary
 * case here, not the edge case.
 */

const GLYPH: Record<NotificationKind, IconName> = {
  owner: 'sharing',
  payment: 'rupee',
  refund: 'retry',
  rent: 'calendar',
  visit: 'mapPin',
  support: 'phone',
  booking: 'bookmark',
};

export type NotificationRowProps = {
  notification: AppNotification;
  onPress?: () => void;
};

export function NotificationRow({ notification, onPress }: NotificationRowProps) {
  const { colors, space, radius } = useTheme();
  const { money, unread } = notification;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${notification.title}. ${notification.body}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderLeftWidth: unread ? 3 : StyleSheet.hairlineWidth,
          borderLeftColor: unread ? colors.brand : colors.border,
          borderRadius: radius.card,
          padding: space[3],
          gap: space[3],
        },
      ]}
    >
      {/* The tile is what makes money items findable without reading. */}
      <View
        style={[
          styles.tile,
          {
            borderRadius: radius.chip,
            backgroundColor: money ? colors.warning.tint : colors.surfaceSunken,
            borderColor: money ? colors.warning.border : 'transparent',
            borderWidth: money ? StyleSheet.hairlineWidth : 0,
          },
        ]}
      >
        <Icon
          name={GLYPH[notification.kind]}
          size={20}
          color={money ? colors.warning.base : colors.textSecondary}
        />
      </View>

      <View style={[styles.flex, { gap: space[1] }]}>
        <View style={[styles.headRow, { gap: space[2] }]}>
          <Text variant={unread ? 'bodyStrong' : 'body'} style={styles.flex}>
            {notification.title}
          </Text>
          {unread ? (
            <View style={[styles.dot, { backgroundColor: colors.brand, borderRadius: radius.pill }]} />
          ) : null}
        </View>
        <Text variant="caption" color="secondary">
          {notification.body}
        </Text>
        <Text variant="numMeta" color="tertiary">
          {notification.timeLabel}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  tile: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headRow: { flexDirection: 'row', alignItems: 'flex-start' },
  dot: { width: 7, height: 7, marginTop: 6 },
  flex: { flex: 1 },
});
