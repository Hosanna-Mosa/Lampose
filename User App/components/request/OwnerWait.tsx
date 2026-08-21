import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Icon, Text } from '@/components/ui';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { formatRemaining } from '@/hooks/useCountdown';

/**
 * The two pieces of the owner-confirmation wait: a draining line and a trail
 * of pinpoints under it.
 *
 * They are one block conceptually — the line is how long, the trail is how far
 * — so they live in one file and are always used together.
 */

/* ------------------------------------------------------------------ *
 * WaitLoader
 * ------------------------------------------------------------------ */

/** Under this many seconds the remaining stub takes the caution colour. */
const URGENT_AT_SECONDS = 30;

export type WaitLoaderProps = {
  /** "Waiting for Padma". The owner is named, not called "the owner". */
  label: string;
  secondsRemaining: number;
  /** The full window, which is what the bar's width is a fraction of. */
  totalSeconds: number;
};

/**
 * A draining line, not a filling one.
 *
 * The bar's width is the time **remaining**: it starts full and reaches nothing
 * at 0:00. A filling bar reads as work being done — which would be a lie here,
 * because nothing is being computed. Something is being waited on, and the
 * honest picture of that is a quantity running out.
 *
 * Under thirty seconds the remaining stub turns caution-orange. Only the stub, not the
 * whole bar, so what changes colour is the thing that is nearly gone. It never
 * turns red: nothing has gone wrong, no money has moved, and a red bar on a
 * student's phone tells a parent looking over their shoulder otherwise.
 *
 * There is no clock. Digits counting down turn a wait into a test — the student
 * watches the number instead of the trail, and every second is a second they
 * are told they are losing. The bar still carries the deadline honestly: it
 * ends when the request does, so nothing about the cancellation arrives without
 * warning. It just does not put a figure on it.
 *
 * The remaining time is still announced to assistive technology, where there is
 * no bar to look at and the length of the wait is otherwise unknowable.
 */
export function WaitLoader({ label, secondsRemaining, totalSeconds }: WaitLoaderProps) {
  const { colors, space, radius } = useTheme();

  const fraction = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsRemaining / totalSeconds)) : 0;
  const urgent = secondsRemaining > 0 && secondsRemaining <= URGENT_AT_SECONDS;

  return (
    <View style={{ gap: space[2] }}>
      <Text variant="bodyStrong" numberOfLines={1}>
        {label}
      </Text>
      <View
        accessibilityRole="progressbar"
        // Announced as time, never as a percentage. "Forty-one percent" is not
        // a thing anyone needs to know about a person answering their phone.
        accessibilityLabel={`${formatRemaining(secondsRemaining)} left`}
        style={[
          styles.track,
          { backgroundColor: colors.surfaceSunken, borderRadius: radius.pill },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${fraction * 100}%`,
              backgroundColor: urgent ? colors.warning.base : colors.brand,
              borderRadius: radius.pill,
            },
          ]}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * OwnerStatusTrail
 * ------------------------------------------------------------------ */

export type TrailStepState = 'done' | 'live' | 'pending' | 'stopped';

export type TrailStep = {
  id: string;
  label: string;
  note?: string;
  /** "9:42 pm". Absent renders an em dash — never "soon". */
  when?: string;
  state: TrailStepState;
};

/**
 * The delivery-tracking pattern, applied to a person deciding.
 *
 * Four pinpoints down a rail. A filled tick for what happened, a haloed ring
 * for what is happening, a hollow dot for what has not, a filled cross for a
 * stop. The rail is **solid behind completed steps and dotted below the live
 * one**: the dotted half is the future, and drawing it solid would make it look
 * like a promise the app is in no position to make.
 *
 * Every step carries a time. The unfinished ones carry an em dash rather than
 * "soon" or "shortly" — the same rule the refund stepper follows, for the same
 * reason: a vague estimate that slips is worse than no estimate.
 *
 * ## The sub-messages arrive rather than sitting there
 *
 * A step's note is withheld until the step is actually reached, then fades and
 * rises into place. That is the whole reason to keep someone on this screen: a
 * trail whose every line is already printed has nothing left to say, whereas a
 * line that appears is evidence that something moved while they were looking.
 *
 * It also stops the notes reading as a script written in advance. "Checking
 * availability" sitting on screen for two minutes before anything is being
 * checked is a small lie; showing it at the moment it becomes true is not.
 */
export function OwnerStatusTrail({ steps }: { steps: readonly TrailStep[] }) {
  const { colors, space } = useTheme();
  const reduceMotion = useReduceMotion();

  return (
    <View>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const done = step.state === 'done';
        const live = step.state === 'live';
        const stopped = step.state === 'stopped';
        const pending = step.state === 'pending';

        return (
          <View key={step.id} style={styles.step}>
            <View style={styles.pin}>
              {/* The rail belongs to the step above the gap, so it is drawn
                  from this dot down to the next one. */}
              {!last ? (
                <View
                  style={[
                    styles.rail,
                    done
                      ? { backgroundColor: colors.brand }
                      : // Dotted, done with a dashed border rather than a
                        // repeating gradient — React Native has no background
                        // images, and a column of tiny Views would be a dozen
                        // extra nodes per step.
                        {
                          backgroundColor: 'transparent',
                          borderLeftWidth: 2,
                          borderStyle: 'dashed',
                          borderColor: colors.border,
                          width: 0,
                        },
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.dot,
                  done || stopped
                    ? {
                        backgroundColor: stopped ? colors.danger.base : colors.brand,
                        borderColor: stopped ? colors.danger.base : colors.brand,
                      }
                    : live
                      ? {
                          backgroundColor: colors.surface,
                          borderColor: colors.brand,
                          borderWidth: 3,
                        }
                      : { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {done ? <Icon name="check" size={16} color={colors.onBrand} /> : null}
                {stopped ? <Icon name="close" size={16} color={colors.onBrand} /> : null}
              </View>
              {/* The halo is a ring of tint behind the live dot. It is the one
                  thing on this screen that says "right now" without moving. */}
              {live ? (
                <View
                  pointerEvents="none"
                  style={[styles.halo, { backgroundColor: colors.success.tint }]}
                />
              ) : null}
            </View>

            <View style={[styles.body, { paddingBottom: last ? 0 : space[4] }]}>
              <View style={[styles.labelRow, { gap: space[2] }]}>
                <Text
                  variant={pending ? 'body' : 'bodyStrong'}
                  color={pending ? 'tertiary' : 'primary'}
                  style={styles.flex}
                >
                  {step.label}
                </Text>
                <Text variant="numMeta" color="tertiary" style={styles.noShrink}>
                  {step.when ?? '—'}
                </Text>
              </View>
              {/*
                Notes belong to reached steps only, and they animate in.

                `key` carries the state, so the note remounts — and therefore
                re-runs its entrance — at the moment the step is reached rather
                than on some unrelated re-render. Reduced motion still gets the
                fade; it is the 8pt rise that is dropped, because the rise is
                the part that is decoration and the fade is the part that says
                "this is new".
              */}
              {step.note && !pending ? (
                <Animated.View
                  key={`${step.id}-${step.state}`}
                  entering={
                    reduceMotion ? FadeIn.duration(160) : FadeInDown.duration(260).springify()
                  }
                >
                  <Text variant="caption" color="tertiary">
                    {step.note}
                  </Text>
                </Animated.View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const DOT = 22;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  noShrink: { flexShrink: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline' },
  track: { height: 6, overflow: 'hidden' },
  fill: { height: '100%' },

  step: { flexDirection: 'row', gap: 12 },
  /* The pin column is exactly the dot's width, so the rail can centre in it
     without a magic number. */
  pin: { width: DOT, alignItems: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  rail: { position: 'absolute', top: DOT - 2, bottom: -2, width: 2 },
  halo: {
    position: 'absolute',
    top: -4,
    width: DOT + 8,
    height: DOT + 8,
    borderRadius: (DOT + 8) / 2,
  },
  /* A hair of top padding lines the first line of text up with the dot's
     centre rather than its top edge. */
  body: { flex: 1, paddingTop: 1 },
});
