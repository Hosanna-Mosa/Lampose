import React, { useEffect, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
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
      {/*
        The boxes are a picture of the value; the input is the whole surface
        on top of them.

        It used to be a 1×1, `opacity: 0` input parked behind the row, focused
        by a Pressable wrapped around the boxes. That does not work on
        Android: a zero-opacity view is not reliably focusable, so tapping the
        boxes called `.focus()` on something the platform would not give focus
        to, no keyboard appeared, and the code could not be typed at all.

        Now the real TextInput covers the row and takes the tap itself. It is
        invisible because its text is transparent and its caret is hidden —
        not because it has no size and no opacity, which are the two things
        that were stopping it working.
      */}
      <View>
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

        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={handleChange}
          keyboardType="number-pad"
          /* Both are needed and they are not the same thing: iOS reads the
             code from the Messages banner off `textContentType`, Android
             fills it from the SMS Retriever API off `autoComplete`. */
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={length}
          autoFocus={autoFocus}
          caretHidden
          accessibilityLabel={`Verification code, ${length} digits`}
          style={[StyleSheet.absoluteFill, styles.overlayInput]}
        />
      </View>

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
  /* Full size and fully opaque, so it is focusable and takes the tap. The
     text and the caret are what are invisible, not the control.
     `fontSize: 1` is not decorative — some Android keyboards (MIUI's and
     Gboard among them) draw their own composing-text underline for digits
     being typed, in their own colour, ignoring `color: 'transparent'`
     entirely. That decoration scales with the glyph, so shrinking the glyph
     to 1px is what actually keeps it from showing, not the transparent
     colour alone. */
  overlayInput: { color: 'transparent', backgroundColor: 'transparent', textAlign: 'center', fontSize: 1 },
  message: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center' },
});
