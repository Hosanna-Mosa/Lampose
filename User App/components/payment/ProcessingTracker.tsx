import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';

import { Icon, Spinner, Text } from '@/components/ui';
import { easing } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { PROCESSING_STEPS, type ProcessingStep } from '@/types/payment';

/**
 * paid → verifying → confirming.
 *
 * This exists to turn dead time into visible progress. **Step one is already
 * green when the screen arrives** — the student has done their part, and
 * showing that is the single most calming element here.
 *
 * The layout does not change when the wait gets long. Only the message does, so
 * a slow payment never reads as an error appearing on screen.
 */

export type ProcessingTrackerProps = {
  current: ProcessingStep;
  /** Past fifteen seconds the copy acknowledges it, without changing shape. */
  slow?: boolean;
  /** Set when polling has stopped and a real resolution time is known. */
  resolveByLabel?: string;
};

export function ProcessingTracker({ current, slow = false, resolveByLabel }: ProcessingTrackerProps) {
  const { colors, space, radius } = useTheme();
  const index = PROCESSING_STEPS.findIndex((step) => step.id === current);

  return (
    <View style={{ gap: space[4] }}>
      <View>
        {PROCESSING_STEPS.map((step, stepIndex) => (
          <Row
            key={step.id}
            label={step.label}
            done={stepIndex < index}
            active={stepIndex === index}
            last={stepIndex === PROCESSING_STEPS.length - 1}
          />
        ))}
      </View>

      <View
        style={{
          backgroundColor: colors.surfaceSunken,
          borderRadius: radius.chip,
          padding: space[3],
          gap: space[1],
        }}
      >
        <Text variant="bodyStrong">
          {resolveByLabel
            ? `We will have an answer by ${resolveByLabel}`
            : slow
              ? 'This is taking longer than usual'
              : 'Usually a few seconds'}
        </Text>
        <Text variant="caption" color="secondary">
          {resolveByLabel
            ? 'You can close the app. We will notify you either way, and your bed stays held until then.'
            : slow
              ? 'Your bank is slow to answer sometimes. Nothing is wrong, your bed is still held, and you do not need to pay again.'
              : 'Safe to leave this screen — we will notify you either way.'}
        </Text>
      </View>
    </View>
  );
}

function Row({
  label,
  done,
  active,
  last,
}: {
  label: string;
  done: boolean;
  active: boolean;
  last: boolean;
}) {
  const { colors, space, radius } = useTheme();
  const reduceMotion = useReduceMotion();

  const progress = useDerivedValue(
    () => withTiming(done ? 1 : 0, { duration: 240, easing: easing.enter }),
    [done],
  );

  const connectorStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? (done ? 1 : 0.25) : 0.25 + progress.value * 0.75,
  }));

  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View
          style={[
            styles.disc,
            {
              borderRadius: radius.pill,
              backgroundColor: done ? colors.success.base : active ? colors.brand : colors.surfaceSunken,
              borderColor: colors.border,
            },
          ]}
        >
          {done ? (
            <Icon name="check" size={16} color={colors.success.on} />
          ) : active ? (
            <Spinner size="small" color={colors.onBrand} />
          ) : (
            <Icon name="completed" size={16} color={colors.textTertiary} />
          )}
        </View>
        {!last ? (
          <Animated.View
            style={[styles.connector, connectorStyle, { backgroundColor: colors.success.base }]}
          />
        ) : null}
      </View>

      <View style={[styles.flex, { paddingBottom: last ? 0 : space[4] }]}>
        <Text
          variant={active ? 'bodyStrong' : 'body'}
          color={done || active ? 'primary' : 'tertiary'}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 28 },
  disc: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  connector: { width: 2, flex: 1, minHeight: 16 },
  flex: { flex: 1 },
});
