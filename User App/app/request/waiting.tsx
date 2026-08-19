import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { BookingStatusChip, CountdownTimer } from '@/components/booking';
import { ListingCard } from '@/components/discovery';
import { WaitingRing } from '@/components/request';
import { useTheme } from '@/context/ThemeContext';
import { feedListings, findListing } from '@/data/listings';
import { formatRupees } from '@/utils/money';
import { OWNER_WINDOW_MINUTES, PAYMENT_WINDOW_MINUTES, type RequestOutcome } from '@/types/request';
import { actions } from '@/constants/actions';
import { usePreviewControls } from '@/hooks/useAppEnv';

/**
 * Waiting, and the three ways it ends.
 *
 * What is deliberately NOT on the waiting screen: similar listings. Showing
 * someone alternatives the moment they commit to a place implies we expect them
 * to be rejected — which is the exact anxiety this screen exists to absorb.
 * What is here instead is the process in plain words, and the one genuinely
 * useful thing to do with the wait.
 *
 * None of the three outcomes is red. Rejected is the owner's decision, expired
 * is nobody's fault, and both are graphite — red would tell a parent looking
 * over a shoulder that money has gone wrong, when nothing has been charged at
 * any point.
 */

const REFERENCE = 'LAM-4192';

export default function RequestWaiting() {
  const previewControls = usePreviewControls();
  const { colors, space, layout, mode, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const listing = useMemo(() => (id ? findListing(id) : undefined), [id]);
  const [outcome, setOutcome] = useState<RequestOutcome>('waiting');

  const deadline = useMemo(
    () => new Date(Date.now() + OWNER_WINDOW_MINUTES * 60_000).toISOString(),
    [],
  );
  const paymentDeadline = useMemo(
    () => new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60_000).toISOString(),
    [],
  );

  const owner = listing?.name.split(' ')[0] ?? 'The owner';
  const alternatives = useMemo(
    () => feedListings.filter((item) => item.id !== id && item.category === listing?.category).slice(0, 3),
    [id, listing],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Your request"
        subtitle={`${listing?.name ?? 'This place'} · ${listing?.sharingLabel ?? ''}`}
        onBack={() => router.replace('/home')}
      />

      <ScrollView
        contentContainerStyle={{
          padding: layout.gutter,
          paddingBottom: insets.bottom + space[8],
          gap: space[5],
        }}
      >
        {outcome === 'waiting' ? (
          <>
            <WaitingRing deadline={deadline} totalSeconds={OWNER_WINDOW_MINUTES * 60} />

            <View style={{ gap: space[3] }}>
              <Text variant="title3">What happens next</Text>
              {[
                `${owner} sees the request on her phone and answers.`,
                'If she says yes, payment opens and you have two hours.',
                'If she says no, or says nothing, the request ends by itself.',
              ].map((line, index) => (
                <View key={line} style={[styles.row, { gap: space[3] }]}>
                  <View style={[styles.num, { backgroundColor: colors.surfaceSunken, borderRadius: 999 }]}>
                    <Text variant="numMeta" color="secondary">
                      {index + 1}
                    </Text>
                  </View>
                  <Text variant="body" color="secondary" style={styles.flex}>
                    {line}
                  </Text>
                </View>
              ))}
              <View
                style={[
                  styles.row,
                  { backgroundColor: colors.success.tint, borderRadius: radius.chip, padding: space[3], gap: space[3] },
                ]}
              >
                <Icon name="check" size={20} color={colors.success.base} />
                <Text variant="bodyStrong" style={{ color: colors.success.ink, flex: 1 }}>
                  Nothing has been charged.
                </Text>
              </View>
            </View>

            {/* Useful, on-topic, and it treats the wait as preparation rather
                than dead time. Not a promoted listing in sight. */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: StyleSheet.hairlineWidth,
                borderRadius: radius.card,
                padding: space[4],
                gap: space[2],
              }}
            >
              <Text variant="title3">Worth asking on move-in day</Text>
              {[
                'Does the deposit match what the app quoted?',
                'When did the rent last go up?',
                'What are the water timings in summer?',
                'Who do I call if something breaks?',
              ].map((question) => (
                <Text key={question} variant="body" color="secondary">
                  · {question}
                </Text>
              ))}
              <Button label={actions.sendToParent} variant="secondary" size="sm" onPress={() => {}} />
            </View>

            {/* Big and selectable — it is the first thing support asks for, and
                a student reading it aloud should not have to squint. */}
            <View style={{ gap: space[1] }}>
              <Text variant="caption" color="secondary">
                Request
              </Text>
              <Text variant="priceLg" selectable>
                {REFERENCE}
              </Text>
            </View>

            <Button label="Cancel this request" variant="ghost" onPress={() => router.replace('/home')} fullWidth />
          </>
        ) : null}

        {outcome === 'accepted' ? (
          <>
            <View style={[styles.centre, { gap: space[3] }]}>
              <View style={[styles.disc, { backgroundColor: colors.success.base, borderRadius: 999 }]}>
                <Icon name="check" size={28} color={colors.success.on} />
              </View>
              <Text variant="title1" style={styles.centredText}>
                {owner} said yes
              </Text>
              <Text variant="bodyLg" color="secondary" style={styles.centredText}>
                {listing?.sharingLabel} at {listing?.name} is held for you. Pay to confirm it and the bed
                is yours from 5 September.
              </Text>
            </View>

            {/* The only context with a ring, because it is the only one where
                the user must act. */}
            <CountdownTimer
              context="payment"
              deadline={paymentDeadline}
              totalSeconds={PAYMENT_WINDOW_MINUTES * 60}
            />

            <Button label="Pay to confirm" onPress={() => router.push(`/pay/${id}` as never)} fullWidth />
            <Text variant="caption" color="secondary" style={styles.centredText}>
              Nobody else can request this bed until then. Nothing has been charged yet.
            </Text>
          </>
        ) : null}

        {outcome === 'rejected' ? (
          <>
            <View style={[styles.centre, { gap: space[3] }]}>
              <BookingStatusChip status="REJECTED" />
              <Text variant="title1" style={styles.centredText}>
                {listing?.name} can&apos;t take you right now
              </Text>
              <Text variant="bodyLg" color="secondary" style={styles.centredText}>
                {owner} declined the request. Nothing was charged, and this does not affect any future
                request you send — here or anywhere else.
              </Text>
            </View>

            {/* Quoted verbatim and framed as the owner's words, not ours. */}
            <View
              style={{
                backgroundColor: colors.surfaceSunken,
                borderRadius: radius.card,
                padding: space[4],
                gap: space[2],
              }}
            >
              <Text variant="caption" color="secondary">
                The reason she gave
              </Text>
              <Text variant="bodyLg">
                “The two-sharing bed was taken this morning by someone who visited last week.”
              </Text>
              <Text variant="numMeta" color="tertiary">
                Owners are not required to give a reason. When they do, we pass it on exactly as written.
              </Text>
            </View>

            <View style={{ gap: space[3] }}>
              <Text variant="title3">Three places that fit what you asked for</Text>
              {alternatives.map((item) => (
                <ListingCard
                  key={item.id}
                  listing={item}
                  variant="list"
                  onPress={() => router.replace(`/listing/${item.id}` as never)}
                />
              ))}
              <Text variant="caption" color="secondary">
                Your details are saved — a new request takes one tap.
              </Text>
            </View>
          </>
        ) : null}

        {outcome === 'expired' ? (
          <>
            <View style={[styles.centre, { gap: space[3] }]}>
              <BookingStatusChip status="EXPIRED" timerSuppressed />
              <Text variant="title1" style={styles.centredText}>
                {owner} didn&apos;t answer in time
              </Text>
              <Text variant="bodyLg" color="secondary" style={styles.centredText}>
                The {OWNER_WINDOW_MINUTES}-minute window closed, so the request ended by itself. Nothing
                was charged, and the bed may well still be free — owners often miss the app when they are
                out.
              </Text>
            </View>

            <View
              style={{
                backgroundColor: colors.surfaceSunken,
                borderRadius: radius.card,
                padding: space[4],
                gap: space[2],
              }}
            >
              <Text variant="bodyStrong">Request {REFERENCE}</Text>
              <Text variant="caption" color="secondary">
                Quoted {formatRupees(listing?.rent ?? 0)} rent and{' '}
                {formatRupees(listing?.deposit ?? 0)} deposit. If you send it again we will re-check the
                price first — it may have moved.
              </Text>
            </View>

            <Button
              label="Send the request again"
              onPress={() => router.replace(`/request/${id}` as never)}
              fullWidth
            />
            <Button label="Find somewhere else" variant="ghost" onPress={() => router.replace('/home')} fullWidth />
          </>
        ) : null}

        {/* Dev only: the owner is not real, so the three outcomes are
            otherwise unreachable. */}
        {previewControls ? (
          <View style={{ gap: space[2], paddingTop: space[4] }}>
            <Text variant="numMeta" color="tertiary">
              outcome — preview only
            </Text>
            <View style={[styles.wrap, { gap: space[2] }]}>
              {(['waiting', 'accepted', 'rejected', 'expired'] as const).map((value) => (
                <Button
                  key={value}
                  label={value}
                  size="sm"
                  variant={outcome === value ? 'primary' : 'secondary'}
                  onPress={() => setOutcome(value)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  centre: { alignItems: 'center' },
  centredText: { textAlign: 'center' },
  num: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  disc: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
});
