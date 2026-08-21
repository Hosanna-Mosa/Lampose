import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Icon, Text } from '@/components/ui';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

/**
 * A screen with one action and no way past it.
 *
 * It renders above the navigator with no back handler and no gesture, and it
 * enters on opacity alone — it did not come from anywhere, and a push
 * transition would imply a way back.
 *
 * There is no "later" and no ✕. A blocking screen with an escape hatch is not
 * a blocking screen.
 */

/** "Check again" gets a cooldown rather than letting the user hammer it. */
const RETRY_COOLDOWN_SECONDS = 15;

export type BlockingScreenProps = {
  headline: string;
  body: string;
  /** The small print under the action — a version pair, a download size. */
  footnote?: string;
  actionLabel: string;
  onAction: () => void;
  /** Puts the action on a cooldown after each press. */
  cooldownOnAction?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** A caution note above the action: a paused deadline, a held booking. */
  notice?: string;
};

export function BlockingScreen({
  headline,
  body,
  footnote,
  actionLabel,
  onAction,
  cooldownOnAction = false,
  secondaryLabel,
  onSecondary,
  notice,
}: BlockingScreenProps) {
  const { colors, space, radius, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleAction = () => {
    onAction();
    if (cooldownOnAction) setCooldown(RETRY_COOLDOWN_SECONDS);
  };

  return (
    <Animated.View
      entering={FadeIn.duration(reduceMotion ? 120 : 200)}
      style={[
        styles.host,
        {
          backgroundColor: colors.bg,
          padding: layout.gutter,
          /* Centre within the SAFE area, not the raw screen. On a phone drawing
             edge-to-edge the retry button would otherwise sit closer to the
             gesture bar than it looks, and this screen is sometimes the only
             thing on it. */
          paddingTop: insets.top + layout.gutter,
          paddingBottom: insets.bottom + layout.gutter,
          gap: space[5],
        },
      ]}
    >
      <View
        style={[
          styles.illustration,
          { borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surfaceSunken },
        ]}
      >
        <Text variant="numMeta" color="tertiary">
          120 × 120
        </Text>
      </View>

      <View style={[styles.centred, { gap: space[2] }]}>
        <Text variant="title1" style={styles.centredText}>
          {headline}
        </Text>
        <Text variant="bodyLg" color="secondary" style={styles.centredText}>
          {body}
        </Text>
      </View>

      {notice ? (
        <View
          style={[
            styles.notice,
            {
              backgroundColor: colors.warning.tint,
              borderColor: colors.warning.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.chip,
              padding: space[3],
              gap: space[2],
            },
          ]}
        >
          <Icon name="clock" size={16} color={colors.warning.ink} />
          <Text variant="caption" style={{ color: colors.warning.ink, flex: 1 }}>
            {notice}
          </Text>
        </View>
      ) : null}

      <View style={[styles.actions, { gap: space[2] }]}>
        <Button
          label={cooldown > 0 ? `${actionLabel} · ${cooldown}s` : actionLabel}
          onPress={handleAction}
          disabled={cooldown > 0}
          fullWidth
        />
        {secondaryLabel && onSecondary ? (
          <Button label={secondaryLabel} variant="ghost" onPress={onSecondary} fullWidth />
        ) : null}
      </View>

      {footnote ? (
        <Text variant="numMeta" color="tertiary" style={styles.centredText}>
          {footnote}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  illustration: {
    width: 120,
    height: 120,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centred: { alignItems: 'center', maxWidth: 340 },
  centredText: { textAlign: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  actions: { alignSelf: 'stretch' },
});
