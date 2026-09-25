import React from 'react';
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
 */

export type VerificationCodeDisplayProps = {
  /**
   * Six digits, from the server. Never generated on the device.
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
  const { colors, mode } = useTheme();
  const reduceMotion = useReduceMotion();

  const digits = code.split('');

  /*
   * Dark mode. The pass was drawn in fixed light colours, and inside a dark
   * card the title and captions — which DO follow the theme — came out light
   * on light. Light mode keeps its original palette exactly; dark mode maps
   * each role onto the theme's own tokens.
   */
  const dark = mode === 'dark';
  const skin = dark
    ? {
        passBadge: { backgroundColor: colors.success.tint, borderColor: colors.success.border },
        passBadgeText: { color: colors.success.ink },
        passIcon: colors.success.ink,
        passTitle: { color: colors.textPrimary },
        offerBox: { backgroundColor: colors.warning.tint, borderColor: colors.warning.borderStrong },
        offerIconBg: { backgroundColor: colors.warning.border },
        offerIcon: colors.warning.ink,
        offerText: { color: colors.warning.ink },
        tile: { backgroundColor: colors.brandTint, borderColor: colors.success.border },
        digit: { color: colors.brandInk },
        metaRow: { backgroundColor: colors.surfaceSunken, borderColor: colors.borderSubtle },
        metaRef: { color: colors.textPrimary },
        metaDot: { backgroundColor: colors.textTertiary },
        metaValid: { color: colors.textSecondary },
        assurances: { backgroundColor: colors.surfaceSunken, borderColor: colors.borderSubtle },
        checkBadge: { backgroundColor: colors.success.tint, borderColor: colors.success.border },
        checkIcon: colors.success.ink,
        assuranceText: { color: colors.textSecondary },
        link: colors.brandInk,
      }
    : {
        passBadge: {},
        passBadgeText: {},
        passIcon: '#059669',
        passTitle: {},
        offerBox: {},
        offerIconBg: {},
        offerIcon: '#D97706',
        offerText: {},
        tile: {},
        digit: {},
        metaRow: {},
        metaRef: {},
        metaDot: {},
        metaValid: {},
        assurances: {},
        checkBadge: {},
        checkIcon: '#059669',
        assuranceText: {},
        link: '#4F46E5',
      };

  return (
    <View style={{ gap: 14, alignItems: 'center', alignSelf: 'stretch' }}>
      {/* Top Pass Category Tag */}
      <View style={[styles.passBadge, skin.passBadge]}>
        <Icon name="verified" size={12} color={skin.passIcon} />
        <Text style={[styles.passBadgeText, skin.passBadgeText]}>MOVE-IN PASS</Text>
      </View>

      <View style={{ gap: 4, alignItems: 'center', alignSelf: 'stretch' }}>
        <Text variant="title2" style={[styles.centred, styles.passTitle, skin.passTitle]}>
          Show this to {ownerName ?? 'the owner'}
        </Text>
      </View>

      {/* Particularly Highlighted Offer Banner */}
      <View style={[styles.offerHighlightBox, skin.offerBox]}>
        <View style={[styles.offerBadgeIcon, skin.offerIconBg]}>
          <Icon name="verified" size={14} color={skin.offerIcon} />
        </View>
        <Text style={[styles.offerHighlightText, skin.offerText]}>
          {ownerName
            ? `Share this PIN with ${ownerName} to confirm your move-in & get a ₹100 coupon code on hotel stays!`
            : 'Share this PIN to confirm your move-in & get a ₹100 coupon code on hotel stays!'}
        </Text>
      </View>

      {/* 6 Digit Tiles: Highlighted Vibrant OTP Boxes */}
      <Animated.View
        entering={reduceMotion ? FadeIn.duration(120) : FadeIn.duration(240).easing(easing.enter)}
        accessible
        accessibilityLabel={`Your move-in code is ${digits.join(' ')}`}
        style={[styles.tiles, { gap: 8 }]}
      >
        {digits.map((digit, index) => (
          <View
            key={`${digit}-${index}`}
            style={[styles.tile, skin.tile]}
          >
            <Text style={[styles.digitText, skin.digit]}>
              {digit}
            </Text>
          </View>
        ))}
      </Animated.View>

      {/*
        Unified Reference & Validity Capsule.

        The reference never shrinks and never truncates — it is the string
        somebody reads down a phone line to support, and half of it is worse
        than none. The validity note is the half that gives way: it is smaller,
        it is allowed to shrink, and it ellipsizes on one line. Before this
        the row could only overflow, and it overflowed CENTRED, so a long
        validity label pushed "Booking LV-672426" out through the capsule's
        left edge.
      */}
      <View style={[styles.metaBadgeRow, skin.metaRow]}>
        <Text style={[styles.metaRefText, skin.metaRef]} numberOfLines={1}>
          Booking {bookingReference}
        </Text>
        <View style={[styles.metaDot, skin.metaDot]} />
        <Text style={[styles.metaValidText, skin.metaValid]} numberOfLines={1}>
          {validLabel}
        </Text>
      </View>

      {/* Assurances: Offline Banner */}
      {variant === 'standalone' ? (
        <View style={[styles.assurancesCard, skin.assurances]}>
          <View style={[styles.row, { gap: 10 }]}>
            <View style={[styles.checkCircleBadge, skin.checkBadge]}>
              <Icon name="check" size={12} color={skin.checkIcon} />
            </View>
            <Text variant="caption" style={[styles.assuranceText, skin.assuranceText]}>
              Downloaded &amp; works offline with no signal.
            </Text>
          </View>
        </View>
      ) : null}

      {onCodeNotWorking ? (
        <Pressable
          onPress={onCodeNotWorking}
          accessibilityRole="button"
          accessibilityLabel="Code not working"
          style={{ minHeight: 38, justifyContent: 'center' }}
        >
          <Text variant="bodyStrong" style={{ color: skin.link }}>
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
      style={{
        // 10, matching the boxed cards this sits among on the booking screen
        // — see `BOX_RADIUS` in `app/bookings/[id].tsx`.
        backgroundColor: content.tone.tint,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: content.tone.border,
        padding: space[4],
        gap: space[3],
      }}
    >
      <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
        <Icon name={content.glyph} size={24} color={content.tone.ink} />
        <Text variant="title3" style={{ color: content.tone.ink, flex: 1 }}>
          {content.headline}
        </Text>
      </View>

      <Text variant="body" style={{ color: content.tone.ink, lineHeight: 22 }}>
        {content.body}
      </Text>

      {kind === 'locked' ? (
        <Pressable
          onPress={onCallSupport}
          accessibilityRole="button"
          accessibilityLabel="Call support to confirm now"
          style={{
            backgroundColor: content.tone.ink,
            borderRadius: radius.button,
            paddingVertical: space[3],
            paddingHorizontal: space[4],
            alignItems: 'center',
            minHeight: 44,
            justifyContent: 'center' as never,
          }}
        >
          <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
            Call support to confirm now
          </Text>
        </Pressable>
      ) : kind === 'wrongDay' ? (
        <Pressable
          onPress={onChangeDate}
          accessibilityRole="button"
          accessibilityLabel="Change move-in date"
          style={{
            backgroundColor: content.tone.ink,
            borderRadius: radius.button,
            paddingVertical: space[3],
            paddingHorizontal: space[4],
            alignItems: 'center',
            minHeight: 44,
            justifyContent: 'center' as never,
          }}
        >
          <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
            Change move-in date
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  passBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 2,
  },
  passBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.8,
  },
  passTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  offerHighlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'stretch',
  },
  offerBadgeIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerHighlightText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    lineHeight: 18,
    flex: 1,
  },
  tiles: { flexDirection: 'row', justifyContent: 'center', alignSelf: 'stretch' },
  tile: {
    flex: 1,
    maxWidth: 52,
    minWidth: 38,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1.5,
    borderRadius: 10,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  digitText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#3730A3',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  metaBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  /* Never shrinks: this is the string read out to support. */
  metaRefText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 0,
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#94A3B8',
    flexShrink: 0,
  },
  /* Smaller than the reference, and the one allowed to give way. */
  metaValidText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    flexShrink: 1,
  },
  assurancesCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  checkCircleBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assuranceText: {
    color: '#475569',
    fontSize: 12,
    flex: 1,
  },
  disc: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
