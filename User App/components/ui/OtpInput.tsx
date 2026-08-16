import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from './Icon';
import { Text } from './Text';
import { easing } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

const GAP = 7;
const HEIGHT = 52;
/** 6 × 44pt — the tightest the row is allowed to get. */
const BASE_ROW = 264;

/**
 * Box width is derived from the length rather than set per screen, so nothing
 * else in the component changes if the backend switches from six digits to
 * four. Clamped at 44 because that is the minimum touch target, and at 56
 * because past that a box stops reading as a single character.
 */
function boxWidth(length: number): number {
  return Math.min(56, Math.max(44, Math.floor(BASE_ROW / length)));
}

export type OtpState = 'idle' | 'verifying' | 'error' | 'autofilled';

export type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  /**
   * Six is recommended. Four digits is 10,000 combinations, which forces
   * aggressive lockout thresholds — and locking out a student who mistyped
   * once on patchy 4G becomes a support ticket. Six allows gentler rate
   * limiting at near-zero cost, because SMS autofill fills the whole field
   * regardless of length.
   */
  length?: 4 | 6;
  state?: OtpState;
  /** Fires when the last digit lands. */
  onComplete?: (value: string) => void;
  /** Shown under the row in the error state. Say how many tries are left. */
  errorMessage?: string;
  autoFocus?: boolean;
};

export function OtpInput({
  value,
  onChange,
  length = 6,
  state = 'idle',
  onComplete,
  errorMessage,
  autoFocus = false,
}: OtpInputProps) {
  const { colors, space, radius } = useTheme();
  const reduceMotion = useReduceMotion();
  const inputRef = useRef<TextInput>(null);
  const shake = useSharedValue(0);

  const width = boxWidth(length);
  const digits = value.slice(0, length).split('');

  // The shake is a second channel on top of the red border and the message —
  // the error is never carried by colour alone.
  useEffect(() => {
    if (state !== 'error' || reduceMotion) return;
    shake.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 45, easing: easing.standard }),
        withTiming(4, { duration: 45, easing: easing.standard }),
        withTiming(0, { duration: 45, easing: easing.standard }),
      ),
      2,
      false,
    );
  }, [state, reduceMotion, shake]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const handleChange = (next: string) => {
    const cleaned = next.replace(/[^0-9]/g, '').slice(0, length);
    onChange(cleaned);
    if (cleaned.length === length) onComplete?.(cleaned);
  };

  return (
    <View style={{ gap: space[2] }}>
      <Pressable
        onPress={() => inputRef.current?.focus()}
        accessibilityRole="none"
        accessibilityLabel={`Verification code, ${length} digits`}
      >
        <Animated.View style={[styles.row, rowStyle, { gap: GAP }]}>
          {Array.from({ length }).map((_, index) => (
            <OtpBox
              key={index}
              index={index}
              digit={digits[index]}
              width={width}
              radius={radius.chip}
              state={state}
              active={index === digits.length}
              colors={colors}
              reduceMotion={reduceMotion}
            />
          ))}
        </Animated.View>
      </Pressable>

      {/* The real input sits behind the boxes so the system keyboard, SMS
          autofill and paste all work without reimplementing any of them. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        style={styles.hiddenInput}
      />

      {state === 'error' && errorMessage ? (
        <View style={[styles.message, { gap: space[1] }]}>
          <Icon name="alert" size={16} color={colors.danger.ink} />
          <Text variant="caption" color="danger">
            {errorMessage}
          </Text>
        </View>
      ) : null}

      {state === 'autofilled' ? (
        <View style={[styles.message, { gap: space[1] }]}>
          <Icon name="check" size={16} color={colors.success.ink} />
          <Text variant="caption" color="success">
            Read from SMS · submitting
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type OtpBoxProps = {
  index: number;
  digit?: string;
  width: number;
  radius: number;
  state: OtpState;
  active: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  reduceMotion: boolean;
};

function OtpBox({ index, digit, width, radius, state, active, colors, reduceMotion }: OtpBoxProps) {
  const scale = useSharedValue(1);

  // Autofill pops each box left to right. The stagger is the whole point: it
  // shows the code arrived from outside rather than being typed.
  useEffect(() => {
    if (state !== 'autofilled' || reduceMotion) return;
    scale.value = withDelay(
      index * 40,
      withSequence(
        withTiming(1.08, { duration: 120, easing: easing.settle }),
        withTiming(1, { duration: 120, easing: easing.settle }),
      ),
    );
  }, [state, index, reduceMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const borderColor =
    state === 'error'
      ? colors.danger.base
      : state === 'autofilled'
        ? colors.success.base
        : active
          ? colors.brand
          : colors.border;

  const background =
    state === 'autofilled'
      ? colors.success.tint
      : digit
        ? colors.surface
        : colors.surfaceSunken;

  return (
    <Animated.View
      style={[
        styles.box,
        animatedStyle,
        {
          width,
          height: HEIGHT,
          borderRadius: radius,
          borderWidth: active || state === 'error' ? 1.5 : 1,
          borderColor,
          backgroundColor: background,
        },
      ]}
    >
      {/* Martian Mono at 600 so a 1 and a 7 cannot be confused at a glance. */}
      <Text variant="priceMd">{digit ?? ''}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignSelf: 'center' },
  box: { alignItems: 'center', justifyContent: 'center' },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  message: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center' },
});
