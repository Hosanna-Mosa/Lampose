import React from 'react';
import { Image, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from './Icon';
import { Text } from './Text';
import { usePressAnimation } from '@/hooks/usePressAnimation';
import { useTheme } from '@/context/ThemeContext';

/* ------------------------------------------------------------------ *
 * Badge
 * ------------------------------------------------------------------ */

export type BadgeProps = {
  label?: string;
  /** A count. Rendered in the numeric face so 9 and 10 hold the same rhythm. */
  count?: number;
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
  /** A bare dot means "something changed". It may never stand in for a number. */
  dot?: boolean;
  size?: 'sm' | 'md';
};

export function Badge({ label, count, tone = 'neutral', dot = false, size = 'md' }: BadgeProps) {
  const { colors, space, radius } = useTheme();

  const sets = {
    neutral: { bg: colors.surfaceSunken, fg: colors.textSecondary },
    brand: { bg: colors.brandTint, fg: colors.info.ink },
    success: { bg: colors.success.tint, fg: colors.success.ink },
    warning: { bg: colors.warning.tint, fg: colors.warning.ink },
    danger: { bg: colors.danger.tint, fg: colors.danger.ink },
  } as const;
  const set = sets[tone];

  if (dot) {
    return (
      <View
        accessibilityLabel="Updated"
        style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.danger.base }}
      />
    );
  }

  if (size === 'sm') {
    return (
      <View
        style={{
          alignSelf: 'flex-start',
          backgroundColor: tone === 'danger' ? colors.danger.base : set.bg,
          borderRadius: radius.pill,
          minWidth: 16,
          height: 16,
          paddingHorizontal: space[1],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color: tone === 'danger' ? '#FFFFFF' : set.fg,
            fontSize: 10,
            lineHeight: 12,
            fontWeight: '700',
          }}
        >
          {count !== undefined ? (count > 99 ? '99+' : count) : label}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: set.bg,
        borderRadius: radius.chip,
        paddingHorizontal: space[2],
        paddingVertical: space[1],
      }}
    >
      <Text variant={count !== undefined ? 'numMeta' : 'label'} style={{ color: set.fg }}>
        {count !== undefined ? count : label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Avatar
 * ------------------------------------------------------------------ */

export type AvatarProps = {
  name: string;
  uri?: string;
  size?: 24 | 32 | 40 | 56;
  verified?: boolean;
};

/**
 * The verified mark is a separate corner glyph, never a colour change on the
 * ring — a coloured ring is not readable as "verified" by anyone who has not
 * been told what it means.
 */
export function Avatar({ name, uri, size = 40, verified = false }: AvatarProps) {
  const { colors, radius } = useTheme();

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View style={{ width: size, height: size }}>
      <View
        accessibilityLabel={name}
        style={[
          styles.centre,
          {
            width: size,
            height: size,
            borderRadius: radius.pill,
            backgroundColor: colors.brandTint,
            overflow: 'hidden',
          },
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" />
        ) : (
          <Text variant={size >= 40 ? 'bodyStrong' : 'numMeta'} style={{ color: colors.info.ink }}>
            {initials}
          </Text>
        )}
      </View>
      {verified ? (
        <View
          style={[
            styles.centre,
            styles.verifiedMark,
            { borderRadius: radius.pill, backgroundColor: colors.success.base, borderColor: colors.surface },
          ]}
        >
          <Icon name="check" size={16} color={colors.success.on} />
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Divider
 * ------------------------------------------------------------------ */

export type DividerProps = {
  /** A word set into the rule, e.g. "or". */
  label?: string;
  /** An 8px background band between sections rather than a hairline. */
  band?: boolean;
};

/** Hairline inside a card, band between sections. Never both in one region. */
export function Divider({ label, band = false }: DividerProps) {
  const { colors, space } = useTheme();

  if (band) return <View style={{ height: 8, backgroundColor: colors.bg }} />;

  if (!label) return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;

  return (
    <View style={[styles.row, { gap: space[3] }]}>
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
      <Text variant="caption" color="tertiary">
        {label}
      </Text>
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

export type CardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  /**
   * Raised is reserved for the one card on a screen that carries money or
   * status. A list of raised cards is banned — if everything is raised,
   * nothing is.
   */
  raised?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export function Card({ children, onPress, raised = false, style, accessibilityLabel }: CardProps) {
  const { colors, radius, elevation } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation('card');

  const surface: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: raised ? 0 : StyleSheet.hairlineWidth,
    borderColor: colors.border,
    // The shadow is static. Only scale and background move on press.
    ...(raised ? elevation.card : elevation.flat),
  };

  if (!onPress) return <View style={[surface, style]}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[surface, animatedStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * Tooltip
 * ------------------------------------------------------------------ */

export type TooltipProps = {
  /** The term as it appears in the sentence. */
  term: string;
  title: string;
  body: string;
};

/**
 * The glossary, in place.
 *
 * Every market term — notice period, two-sharing, mess — is defined in one
 * plain sentence where it is used. Tap-triggered, because there is no hover on
 * a phone, and the dotted underline is what says it can be tapped.
 */
export function Tooltip({ term, title, body }: TooltipProps) {
  const { colors, space, radius, elevation } = useTheme();
  const [open, setOpen] = React.useState(false);

  return (
    <View>
      <Pressable
        onPress={() => setOpen((previous) => !previous)}
        accessibilityRole="button"
        accessibilityLabel={`${term}. Definition.`}
        accessibilityState={{ expanded: open }}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text
          variant="bodyLg"
          style={{
            textDecorationLine: 'underline',
            textDecorationStyle: 'dotted',
            color: colors.textPrimary,
          }}
        >
          {term}
        </Text>
      </Pressable>

      {open ? (
        <>
          {/* Any outside tap dismisses it. */}
          <Pressable
            onPress={() => setOpen(false)}
            accessibilityLabel="Close definition"
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              {
                backgroundColor: colors.graphiteRaised,
                borderRadius: radius.chip,
                padding: space[3],
                gap: space[1],
                maxWidth: 280,
              },
              elevation.float,
            ]}
          >
            <Text variant="bodyStrong" color="onGraphite">
              {title}
            </Text>
            <Text variant="caption" color="onGraphiteMuted">
              {body}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  verifiedMark: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderWidth: 2,
  },
});
