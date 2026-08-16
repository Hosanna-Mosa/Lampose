import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

/**
 * A settings row, and the group heading above it.
 *
 * The `value` on the right is doing real work: "4", "2 saved", "All on". A
 * settings list where every row is a bare label forces someone to open each one
 * to learn the state of their own account. Showing the value means most visits
 * to this screen end without a tap.
 */

export type ProfileRowProps = {
  label: string;
  /** The current state, shown so the row need not be opened to learn it. */
  value?: string;
  onPress?: () => void;
  /** Sign out and delete. Rendered in the danger ink, and never given a value. */
  destructive?: boolean;
  last?: boolean;
};

export function ProfileRow({ label, value, onPress, destructive, last = false }: ProfileRowProps) {
  const { colors, space, touch } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: touch.listRow,
          gap: space[3],
          paddingHorizontal: space[4],
          borderBottomColor: colors.borderSubtle,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
        },
      ]}
    >
      <Text
        variant="body"
        style={[styles.flex, destructive ? { color: colors.danger.base } : {}]}
      >
        {label}
      </Text>
      {value ? (
        <Text variant="numMeta" color="secondary">
          {value}
        </Text>
      ) : null}
      <Icon name="chevronRight" size={20} color={colors.textTertiary} />
    </Pressable>
  );
}

export type ProfileGroupProps = {
  title?: string;
  children: React.ReactNode;
};

export function ProfileGroup({ title, children }: ProfileGroupProps) {
  const { colors, space, radius } = useTheme();

  return (
    <View style={{ gap: space[2] }}>
      {title ? (
        <Text variant="caption" color="tertiary" style={{ paddingHorizontal: space[1] }}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.card,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
