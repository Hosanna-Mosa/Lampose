import * as Brightness from 'expo-brightness';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon, Text } from '@/components/ui';
import { easing } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

/**
 * The move-in code — the biggest trust moment in the product.
 *
 * It is generated when the payment settles and cached at that moment, because
 * PG stairwells have no signal and this is the one screen that has to work
 * without any. The owner types it into their app to mark the student moved in.
 *
 * Four digits, not six. It is read aloud across a room and typed by someone
 * else, so every extra character is a cost paid by a 55-year-old owner without
 * their glasses. The numerals use `codeHero`, which is the only style in the
 * type scale that opts out of OS font scaling entirely — a scaled code wraps,
 * and a wrapped code breaks the one thing it is for.
 *
 * Screen brightness is forced to maximum on mount and restored on unmount.
 */

export type VerificationCodeDisplayProps = {
  /**
   * Six digits, from the server. Never generated on the device.
   *
   * A code the client invents is a code the owner's app cannot verify, so this
   * is always a value that arrived over the wire.
   */
  code: string;
  bookingReference: string;
  ownerName?: string;
  /** "Valid today until 11:59 pm" — the window, from the server. */
  validLabel: string;
  /** Standalone screen versus embedded in the confirmation. */
  variant?: 'standalone' | 'embedded';
  onCodeNotWorking?: () => void;
};

export function VerificationCodeDisplay({
  code,
  bookingReference,
  ownerName,
  validLabel,
  variant = 'standalone',
  onCodeNotWorking,
}: VerificationCodeDisplayProps) {
  const { colors, space, radius } = useTheme();
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (variant !== 'standalone') return;
    let previous: number | null = null;
    let active = true;

    // Max brightness, then put it back. An owner reading this at arm's length
    // in a dim corridor is the case it exists for.
    (async () => {
      const { granted } = await Brightness.requestPermissionsAsync();
      if (!granted || !active) return;
      previous = await Brightness.getBrightnessAsync();
      await Brightness.setBrightnessAsync(1);
    })();

    return () => {
      active = false;
      if (previous !== null) Brightness.setBrightnessAsync(previous);
    };
  }, [variant]);

  const digits = code.split('');

  return (
    <View style={{ gap: space[4], alignItems: 'center' }}>
      <View style={{ gap: space[1], alignItems: 'center' }}>
        <Text variant="title1" style={styles.centred}>
          Show this to {ownerName ?? 'the owner'}
        </Text>
        <Text variant="bodyLg" color="secondary" style={styles.centred}>
          {ownerName ? `${ownerName} types` : 'They type'} it into their app to mark you moved in. Only give
          it to them once you&apos;re standing in the room.
        </Text>
      </View>

      <Animated.View
        entering={reduceMotion ? FadeIn.duration(120) : FadeIn.duration(240).easing(easing.enter)}
        accessible
        accessibilityLabel={`Your move-in code is ${digits.join(' ')}`}
        style={[styles.tiles, { gap: space[2] }]}
      >
        {digits.map((digit, index) => (
          /*
           * Outlined in the accent, not filled in graphite.
           *
           * Changed with the Dock repaint to match the reference's gate-code
           * screen, and it is a legibility change rather than a stylistic one.
           * Four solid near-black slabs are the heaviest mark this app ever
           * draws, and they were competing with the confirmation's own
           * meaning — the code is the *answer*, so it should read as a value
           * on the page rather than as four buttons.
           *
           * The outline also survives the thing this screen is built for. It
           * runs at forced maximum brightness in a dim corridor, where a large
           * black field blooms and the white numerals inside it smear; ink on
           * white does not. 6.25:1 for the numeral, and the accent edge is
           * what makes the four boxes a set.
           */
          <View
            key={`${digit}-${index}`}
            style={[
              styles.tile,
              {
                backgroundColor: colors.surface,
                borderColor: colors.brand,
                borderWidth: 1.5,
                borderRadius: radius.card,
              },
            ]}
          >
            {/* codeHero: 50px, DM Mono, tabular, and the only style in the app
                that never scales with the OS setting. */}
            <Text variant="codeHero" style={{ color: colors.brandInk }}>
              {digit}
            </Text>
          </View>
        ))}
      </Animated.View>

      <View style={{ gap: space[1], alignItems: 'center' }}>
        <Text variant="priceSm" color="secondary">
          Booking {bookingReference}
        </Text>
        <Text variant="caption" color="secondary">
          {validLabel}
        </Text>
      </View>

      {variant === 'standalone' ? (
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.chip,
            padding: space[3],
            gap: space[2],
            alignSelf: 'stretch',
          }}
        >
          <View style={[styles.row, { gap: space[2] }]}>
            <Icon name="check" size={16} color={colors.success.base} />
            <Text variant="caption" color="secondary" style={styles.flex}>
              Screen brightness turned up for you.
            </Text>
          </View>
          <View style={[styles.row, { gap: space[2] }]}>
            <Icon name="check" size={16} color={colors.success.base} />
            <Text variant="caption" color="secondary" style={styles.flex}>
              Downloaded when you paid, so it works with no signal.
            </Text>
          </View>
        </View>
      ) : null}

      {onCodeNotWorking ? (
        <Pressable
          onPress={onCodeNotWorking}
          accessibilityRole="button"
          accessibilityLabel="Code not working"
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="bodyStrong" color="brand">
            Code not working?
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * When it goes wrong
 * ------------------------------------------------------------------ */

export type CodeProblemKind = 'mistyped' | 'locked' | 'wrongDay';

export type VerificationCodeProblemProps = {
  kind: CodeProblemKind;
  code: string;
  /** Remaining attempts, for the mistyped state. */
  triesLeft?: number;
  /** The date the code is valid on, for the wrong-day state. */
  validOn?: string;
  onCallSupport?: () => void;
  onChangeDate?: () => void;
};

/**
 * Every failure here says the same load-bearing thing: a code problem is never
 * a booking problem.
 *
 * A student standing in a doorway with an owner watching needs to know, in the
 * first sentence, that their rent and deposit are paid and the room is theirs.
 */
export function VerificationCodeProblem({
  kind,
  code,
  triesLeft,
  validOn,
  onCallSupport,
  onChangeDate,
}: VerificationCodeProblemProps) {
  const { colors, space, radius } = useTheme();

  const content =
    kind === 'mistyped'
      ? {
          tone: colors.warning,
          glyph: 'clock' as const,
          headline: `That didn't match${triesLeft !== undefined ? ` — ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left` : ''}`,
          body: `Check they're on the right booking. Your code is ${code} and it hasn't changed. Nothing about your booking is affected by a mistyped code.`,
        }
      : kind === 'locked'
        ? {
            tone: colors.danger,
            glyph: 'expired' as const,
            headline: 'Code locked for 15 minutes',
            body: "Three wrong tries, so we've paused it to keep your booking safe. You are still moved in as far as we're concerned — your rent and deposit are paid and the room is yours. If the owner needs to confirm now, we can do it over the phone.",
          }
        : {
            tone: colors.warning,
            glyph: 'clock' as const,
            headline: `This code works on ${validOn ?? 'your move-in date'}`,
            body: "That's your move-in date. If you need to arrive earlier or later, change the date first — the owner has to agree to it, and the code follows the new date automatically.",
          };

  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: content.tone.tint,
        borderColor: content.tone.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.chip,
        padding: space[3],
        gap: space[3],
      }}
    >
      <View style={[styles.row, { gap: space[3], alignItems: 'flex-start' }]}>
        <View style={[styles.disc, { borderRadius: radius.pill, backgroundColor: content.tone.base }]}>
          <Icon name={content.glyph} size={16} color={content.tone.on} />
        </View>
        <View style={[styles.flex, { gap: space[1] }]}>
          <Text variant="bodyStrong" style={{ color: content.tone.ink }}>
            {content.headline}
          </Text>
          <Text variant="caption" style={{ color: content.tone.ink }}>
            {content.body}
          </Text>
        </View>
      </View>

      {kind === 'locked' && onCallSupport ? (
        <Pressable
          onPress={onCallSupport}
          accessibilityRole="button"
          accessibilityLabel="Call LAMPOSE support"
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="bodyStrong" style={{ color: content.tone.ink, textDecorationLine: 'underline' }}>
            Call LAMPOSE support
          </Text>
        </Pressable>
      ) : null}

      {kind === 'wrongDay' && onChangeDate ? (
        <Pressable
          onPress={onChangeDate}
          accessibilityRole="button"
          accessibilityLabel="Change my move-in date"
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="bodyStrong" style={{ color: content.tone.ink, textDecorationLine: 'underline' }}>
            Change my move-in date
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  centred: { textAlign: 'center' },
  tiles: { flexDirection: 'row', justifyContent: 'center', alignSelf: 'stretch' },
  /*
   * Six tiles have to fit the narrowest phone we ship to.
   *
   * At the old fixed 72pt this row was 472pt wide against 328pt of usable
   * width on a 360dp screen — it ran off both edges. The width now comes from
   * the row: each tile takes an equal share of whatever is there, capped at 72
   * so four digits do not stretch into slabs, floored at 40 so a 50pt numeral
   * still has room either side.
   *
   * Height stays fixed. The digit does not scale with the OS font setting, so
   * neither should the box around it.
   */
  tile: { flex: 1, maxWidth: 72, minWidth: 40, height: 96, alignItems: 'center', justifyContent: 'center' },
  disc: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
