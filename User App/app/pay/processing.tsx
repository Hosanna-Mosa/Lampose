import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Spinner, Text } from '@/components/ui';
import { ProcessingTracker } from '@/components/payment';
import { useTheme } from '@/context/ThemeContext';
import { findListing } from '@/data/listings';
import { formatRupees } from '@/utils/money';
import { actions } from '@/constants/actions';
import {
  failureCopy,
  POLL_GIVE_UP_MS,
  POLL_SLOW_MS,
  type FailureKind,
  type PaymentPhase,
  type ProcessingStep,
} from '@/types/payment';
import { usePreviewControls } from '@/hooks/useAppEnv';

/**
 * Leaving, returning, waiting, and the three ways it fails.
 *
 * **Leaving** and **returning** are separate moments because the emotional
 * question changes between them. Leaving asks "what do I do"; returning asks
 * "did it work". The returning screen answers with what is already certain —
 * the bed is held, money in transit is not lost — before it knows the outcome.
 *
 * It never says "successful" until the server says so. A cancelled return and a
 * successful one are indistinguishable at that instant, so the copy does not
 * guess.
 *
 * There is no back button anywhere in here. Navigating backwards out of a
 * payment mid-flight is how someone ends up paying twice.
 */
export default function PaymentProcessing() {
  const previewControls = usePreviewControls();
  const { colors, space, layout, mode, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const listing = useMemo(() => (id ? findListing(id) : undefined), [id]);
  const total = (listing?.rent ?? 0) + (listing?.deposit ?? 0) + 1000 + 499 - 500;

  const [phase, setPhase] = useState<PaymentPhase>('leaving');
  const [step, setStep] = useState<ProcessingStep>('verifying');
  const [elapsed, setElapsed] = useState(0);
  const [failure, setFailure] = useState<FailureKind>('unconfirmed');

  // 42a holds for ~600ms while the intent fires, then the app is "away".
  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = setTimeout(() => setPhase('returning'), 1400);
    return () => clearTimeout(timer);
  }, [phase]);

  // 42b is brief: it exists to answer "did it work" before the poll starts.
  useEffect(() => {
    if (phase !== 'returning') return;
    const timer = setTimeout(() => setPhase('processing'), 1600);
    return () => clearTimeout(timer);
  }, [phase]);

  // The poll. Backoff so a slow webhook does not hammer a 4G connection, and a
  // hard stop at ninety seconds — never poll forever.
  useEffect(() => {
    if (phase !== 'processing') return;
    const started = Date.now();
    const timer = setInterval(() => {
      const ms = Date.now() - started;
      setElapsed(ms);
      if (ms > 4000) setStep('confirming');
      if (ms >= POLL_GIVE_UP_MS) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [phase]);

  const slow = elapsed >= POLL_SLOW_MS;
  const gaveUp = elapsed >= POLL_GIVE_UP_MS;

  const copy = failureCopy(failure, {
    amount: formatRupees(total),
    holdUntil: '6:40 pm',
    reference: 'LAM-4192',
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: layout.gutter,
          paddingTop: insets.top + space[6],
          paddingBottom: insets.bottom + space[6],
          gap: space[5],
        }}
      >
        {phase === 'leaving' ? (
          <View style={[styles.centre, { gap: space[4] }]}>
            <Spinner size="large" />
            <View style={[styles.centre, { gap: space[2] }]}>
              <Text variant="title1" style={styles.centredText}>
                Opening your UPI app
              </Text>
              <Text variant="bodyLg" color="secondary" style={styles.centredText}>
                Approve {formatRupees(total)} there, then come straight back — this app finishes the
                booking. Don&apos;t close either one.
              </Text>
            </View>

            {/* Anti-fraud hygiene in a market where UPI scams are common — and
                a habit worth teaching. */}
            <View
              style={{
                alignSelf: 'stretch',
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: StyleSheet.hairlineWidth,
                borderRadius: radius.card,
                padding: space[4],
                gap: space[3],
              }}
            >
              <Text variant="bodyStrong">Check these three match, before you approve</Text>
              <Field label="Paying to" value="LAMPOSE Technologies" />
              <Field label="Reference" value="LAM-4192" />
              <Field label="Amount" value={`${formatRupees(total)}.00`} />
              <Text variant="caption" color="secondary">
                If any of them is different, cancel in your UPI app and tell us.
              </Text>
            </View>
          </View>
        ) : null}

        {phase === 'returning' ? (
          <View style={[styles.centre, { gap: space[4] }]}>
            <Spinner size="large" />
            <View style={[styles.centre, { gap: space[2] }]}>
              <Text variant="title1" style={styles.centredText}>
                Welcome back — checking with your bank
              </Text>
              <Text variant="bodyLg" color="secondary" style={styles.centredText}>
                We don&apos;t take your word for it or a screenshot — we confirm the money directly. This
                usually takes a few seconds.
              </Text>
            </View>

            {/* What is already certain, before the outcome is known. */}
            <View style={{ alignSelf: 'stretch', gap: space[2] }}>
              <Reassurance text="Your bed is still held for you" />
              <Reassurance text="If the money left your account, it is with us — not lost" />
            </View>

            <Text variant="caption" color="tertiary" style={styles.centredText}>
              Safe to leave this screen. We&apos;ll notify you either way.
            </Text>
          </View>
        ) : null}

        {phase === 'processing' ? (
          <View style={{ gap: space[5] }}>
            <View style={{ gap: space[2] }}>
              <Text variant="display2">Confirming your payment</Text>
              <Text variant="bodyLg" color="secondary">
                {formatRupees(total)} · LAM-4192
              </Text>
            </View>

            <ProcessingTracker
              current={step}
              slow={slow}
              resolveByLabel={gaveUp ? '10:15 am' : undefined}
            />

            {gaveUp ? (
              <View style={{ gap: space[2] }}>
                <Button label={actions.support} variant="secondary" onPress={() => {}} fullWidth />
                <Text variant="caption" color="secondary">
                  Do not pay again. If the money left your account it is with us, and your bed is held
                  until we resolve it.
                </Text>
              </View>
            ) : null}

            {previewControls ? (
              <View style={{ gap: space[2], paddingTop: space[4] }}>
                <Text variant="numMeta" color="tertiary">
                  outcome — preview only
                </Text>
                <View style={[styles.wrap, { gap: space[2] }]}>
                  <Button
                    label="confirmed"
                    size="sm"
                    variant="secondary"
                    onPress={() => router.replace({ pathname: '/pay/confirmed', params: { id } })}
                  />
                  {(['declined', 'unconfirmed', 'unreachable'] as const).map((kind) => (
                    <Button
                      key={kind}
                      label={kind}
                      size="sm"
                      variant="secondary"
                      onPress={() => {
                        setFailure(kind);
                        setPhase('failed');
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {phase === 'failed' ? (
          <View style={{ gap: space[5] }}>
            <View style={{ gap: space[2] }}>
              {/* The lead runs ahead of any explanation. Someone who thinks
                  they have lost ₹26,499 reads one sentence and nothing else. */}
              {copy.lead ? (
                <Text variant="display2" style={{ color: colors.danger.ink }}>
                  {copy.lead}
                </Text>
              ) : null}
              <Text variant={copy.lead ? 'title1' : 'display2'}>{copy.headline}</Text>
              <Text variant="bodyLg" color="secondary">
                {copy.body}
              </Text>
            </View>

            <View style={{ gap: space[2] }}>
              <Button
                label={copy.primary}
                onPress={() =>
                  copy.retrySafe ? router.replace({ pathname: '/pay/[id]', params: { id } }) : setPhase('processing')
                }
                fullWidth
              />
              {copy.secondary ? (
                <Button label={copy.secondary} variant="secondary" onPress={() => {}} fullWidth />
              ) : null}
            </View>

            <Text variant="numMeta" color="tertiary">
              LAM-4192 · support can read this reference
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text variant="priceSm" selectable>
        {value}
      </Text>
    </View>
  );
}

function Reassurance({ text }: { text: string }) {
  const { colors, space, radius } = useTheme();
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.success.tint, borderRadius: radius.chip, padding: space[3], gap: space[2] },
      ]}
    >
      <Icon name="check" size={20} color={colors.success.base} />
      <Text variant="bodyStrong" style={{ color: colors.success.ink, flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  centredText: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  fieldRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
});
