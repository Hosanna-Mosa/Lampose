import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Checkbox, Icon, Text, TextField } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { CountdownTimer } from '@/components/booking';
import { QuoteCard } from '@/components/request';
import { errorStates } from '@/constants/copy';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { findListing } from '@/data/listings';
import { formatRupees } from '@/utils/money';
import {
  EMPTY_TENANT,
  FIELD_AUDIENCE,
  OWNER_WINDOW_MINUTES,
  PAYMENT_WINDOW_MINUTES,
  quoteTotal,
  tenantIssues,
  tenantReady,
  type Quote,
  type TenantDetails,
} from '@/types/request';

/**
 * The request, in three steps.
 *
 * "Nothing is charged today" appears on every one of them, and again on the
 * waiting screen, and again in the push. Four times in one flow, deliberately:
 * a parent scanning their child's phone reads one line, and it should be that
 * one.
 */

const STEPS = ['Your quote', 'Your details', 'Check and send'] as const;

export default function RequestFlow() {
  const { colors, space, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const listing = useMemo(() => (id ? findListing(id) : undefined), [id]);

  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<TenantDetails>(() => ({
    ...EMPTY_TENANT,
    name: user?.name ?? '',
    phone: user?.phone ?? '',
  }));
  const [agreed, setAgreed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const quote: Quote | null = useMemo(() => {
    if (!listing || listing.rent === null) return null;
    return {
      id: `qt-${listing.id}`,
      listingId: listing.id,
      propertyName: listing.name,
      sharingLabel: listing.sharingLabel ?? 'One bed',
      gender: listing.gender === 'BOYS' ? 'Boys' : listing.gender === 'GIRLS' ? 'Girls' : 'Co-ed',
      locality: listing.locality,
      moveInLabel: '5 September',
      rent: listing.rent,
      deposit: listing.deposit ?? 0,
      depositMonths: listing.depositMonths ?? 0,
      joiningCharge: 1000,
      lamposeFee: 499,
      discount: 500,
      validUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
      quotedAtLabel: 'quoted just now · held for 10 minutes',
    };
  }, [listing]);

  if (!listing || !quote) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StateTemplate
          copy={errorStates.notFound()}
          onPrimary={() => router.replace('/home')}
          onSecondary={() => router.back()}
        />
      </View>
    );
  }

  const issues = tenantIssues(details);
  const total = quoteTotal(quote);

  const set = (key: keyof TenantDetails, value: string) =>
    setDetails((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setSubmitting(true);
    // On submit the quote FREEZES — the accepted request preserves this exact
    // quote id, so the owner accepts the price the student saw.
    await new Promise((resolve) => setTimeout(resolve, 600));
    setSubmitting(false);
    router.replace({ pathname: '/request/waiting', params: { id: listing.id } });
  };

  const canContinue =
    step === 0 ? !expired : step === 1 ? tenantReady(details) : agreed;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title={STEPS[step]}
        subtitle={`Step ${step + 1} of 3 · nothing is charged today`}
        onBack={() => (step === 0 ? router.back() : setStep(step - 1))}
      />

      <ScrollView
        contentContainerStyle={{
          padding: layout.gutter,
          paddingBottom: insets.bottom + space[8],
          gap: space[5],
        }}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 ? (
          <>
            {/* Quietest of the three clocks — nothing is lost when it ends. */}
            {!expired ? (
              <CountdownTimer
                context="quote"
                deadline={quote.validUntil}
                onExpire={() => setExpired(true)}
              />
            ) : null}
            <QuoteCard quote={quote} expired={expired} />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <View
              style={{
                backgroundColor: colors.surfaceSunken,
                borderRadius: 8,
                padding: space[3],
                gap: space[1],
              }}
            >
              <Text variant="bodyStrong">We ask for as little as we can</Text>
              <Text variant="caption" color="secondary">
                Every field says who sees it and why. Nothing here is sold or shared with anyone else.
              </Text>
            </View>

            <TextField
              label="Your name"
              value={details.name}
              onChangeText={(value) => set('name', value)}
              autoCapitalize="words"
              error={issues.name}
              helper={FIELD_AUDIENCE.name}
            />
            <TextField
              label="Your number"
              value={details.phone}
              onChangeText={(value) => set('phone', value)}
              keyboardType="number-pad"
              helper={FIELD_AUDIENCE.phone}
            />
            <TextField
              label="A guardian's number"
              value={details.guardianPhone}
              onChangeText={(value) => set('guardianPhone', value.replace(/[^0-9]/g, '').slice(0, 10))}
              keyboardType="number-pad"
              maxLength={10}
              error={issues.guardianPhone}
              helper={FIELD_AUDIENCE.guardianPhone}
            />
            <TextField
              label="Last 4 digits of your ID"
              value={details.idLast4}
              onChangeText={(value) => set('idLast4', value.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              error={issues.idLast4}
              helper={FIELD_AUDIENCE.idLast4}
            />
            <TextField
              label="Anything to tell the owner"
              optional
              multiline
              value={details.note}
              onChangeText={(value) => set('note', value)}
              helper={FIELD_AUDIENCE.note}
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            {/* Spells out what the tap does, before the tap. */}
            <View style={{ gap: space[3] }}>
              <Text variant="title3">What happens when you tap send</Text>
              {[
                `The owner gets your request. She has ${OWNER_WINDOW_MINUTES} minutes to accept or decline.`,
                `If she accepts, payment opens. You then have ${PAYMENT_WINDOW_MINUTES / 60} hours to pay ${formatRupees(total)}.`,
              ].map((line, index) => (
                <View key={line} style={[styles.step, { gap: space[3] }]}>
                  <View
                    style={[
                      styles.stepNumber,
                      { backgroundColor: colors.brandTint, borderRadius: 999 },
                    ]}
                  >
                    <Text variant="numMeta" style={{ color: colors.info.ink }}>
                      {index + 1}
                    </Text>
                  </View>
                  <Text variant="body" style={styles.flex}>
                    {line}
                  </Text>
                </View>
              ))}
              <View
                style={[
                  styles.step,
                  { backgroundColor: colors.success.tint, borderRadius: 8, padding: space[3], gap: space[3] },
                ]}
              >
                <Icon name="check" size={20} color={colors.success.base} />
                <Text variant="bodyStrong" style={{ color: colors.success.ink, flex: 1 }}>
                  Nothing is charged today. Not now, not when she accepts — only when you pay.
                </Text>
              </View>
            </View>

            <QuoteCard quote={quote} />

            <Checkbox
              label="I have read what I am agreeing to, and the house rules."
              checked={agreed}
              onChange={setAgreed}
            />
          </>
        ) : null}

        <Button
          label={
            step === 0
              ? expired
                ? "Get today's price"
                : 'Continue'
              : step === 1
                ? 'Continue'
                : 'Send request'
          }
          loading={submitting}
          loadingLabel="Sending your request"
          disabled={!canContinue}
          onPress={() => {
            if (step === 0 && expired) {
              setExpired(false);
              return;
            }
            if (step === 2) submit();
            else setStep(step + 1);
          }}
          fullWidth
        />

        <Text variant="caption" color="secondary" style={styles.centred}>
          Nothing is charged today.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centred: { textAlign: 'center' },
  step: { flexDirection: 'row', alignItems: 'center' },
  stepNumber: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
