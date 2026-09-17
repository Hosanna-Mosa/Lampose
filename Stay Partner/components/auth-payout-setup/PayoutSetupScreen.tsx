/* ══════════════════════════════════════════════════════════════════════════
   Where a hotel owner's money comes from.

   ## Why this blocks the app for hotel owners and nobody else

   A hotel is the one category where a guest's money passes through Lampose on
   its way to the owner: the guest pays the full stay, we keep a commission,
   and the rest is settled to the hotel. Until Razorpay knows who to settle it
   to, that money sits held — the owner has rooms booked and nothing they can
   be paid into.

   PG, hostel and co-living owners collect rent themselves and are never asked
   any of this. The SERVER decides who sees this screen (`ownsHotel` on
   `/payout-onboarding`, read from the properties collection), so the app never
   has to work out anybody's category and cannot be talked out of the gate by
   a client-side flag.

   ## Why it asks for more than an account number

   `earnings/methods` already takes a bank account, and for the older payout
   flow that is enough — Lampose pays from an account Lampose owns. Route is
   not that: the hotel becomes a sub-merchant Razorpay settles to directly, so
   Razorpay onboards them as a merchant and wants a legal name, a business
   type, a PAN and a registered address. Asking for less would mean collecting
   details that could never actually pay anybody.

   ## Submitting is not being approved

   Razorpay activates the account, not us, and only `active` lets money move.
   So the screen has three faces: the form, "we have it, they are checking",
   and a refusal with Razorpay's own reason. A screen that said "done" on
   submit would have owners waiting on a payout that was never going to come.
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Box, Spinner } from '@/components/common';
import { useRouter } from 'expo-router';

import { Button, Card, Input, Screen, Text } from '@/components/common';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAlert } from '@/components/common';
import { PREVIEW_CONTROLS } from '@/constants/env';
import { useColors } from '@/hooks/useColors';
import {
  devActivatePayout, fetchPayoutOnboarding, refreshPayoutOnboarding,
  submitPayoutOnboarding, type PayoutOnboarding,
} from '@/services/api/payoutOnboarding.api';
import { centred } from '@/components/common/utils/styles';

type Form = {
  beneficiaryName: string;
  accountNumber: string;
  ifsc: string;
};

const EMPTY: Form = { beneficiaryName: '', accountNumber: '', ifsc: '' };

/**
 * Three fields, because that is what a bank transfer needs.
 *
 * An earlier version asked for ten — a PAN, a business type, a registered
 * address — because the hotel was being onboarded as a Razorpay sub-merchant.
 * They are a payee now: Lampose pays them from its own account, and RazorpayX
 * wants a name, an account and an IFSC. Every field removed was one nothing
 * downstream ever read.
 */
const FIELDS: { key: keyof Form; label: string; hint?: string; caps?: boolean }[] = [
  { key: 'beneficiaryName', label: 'Account holder’s name', hint: 'Exactly as your bank has it' },
  { key: 'accountNumber', label: 'Bank account number' },
  { key: 'ifsc', label: 'IFSC', hint: 'HDFC0001234', caps: true },
];

export function PayoutSetupScreen() {
  const c = useColors();
  const router = useRouter();
  const { confirm } = useAlert();

  const [state, setState] = useState<PayoutOnboarding | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const next = await fetchPayoutOnboarding();
      setState(next);
      /* Already payable — nothing to ask. The gate in `_layout` will move them
         on; this handles somebody landing here directly. */
      if (!next.required) router.replace('/');
    } catch {
      setError('We could not check your payout details. Pull to try again.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const next = await submitPayoutOnboarding({
        ...form,
        beneficiaryName: form.beneficiaryName.trim(),
        accountNumber: form.accountNumber.replace(/\s/g, ''),
        ifsc: form.ifsc.trim().toUpperCase(),
      });
      setState(next);
      if (!next.required) router.replace('/');
    } catch (caught) {
      /* The SERVER's sentence. It knows which field is wrong and how — "that
         does not look like a PAN" is worth more than "check your details". */
      setError((caught as { displayMessage?: string })?.displayMessage
        ?? 'We could not save those details. Please check them and try again.');
    } finally {
      setBusy(false);
    }
  };

  /*
   * DEVELOPMENT ONLY — skip the whole thing.
   *
   * Route is not enabled on the test account, so a real linked account cannot
   * be created and everything past this gate — the held transfer, the admin
   * Monitor's Withdraw — is unreachable. This marks the owner payable with an
   * obviously fake account id.
   *
   * Drawn on a preview build AND only when the server says it allows it, so
   * it is never a button that can only 404. Delete with `devActivatePayout`.
   */
  const devSkip = async () => {
    const yes = await confirm({
      title: 'Skip payout setup?',
      message: 'Development bypass — this marks you as payable with a fake account so the rest '
        + 'of the app can be tested. No real payout can reach it.',
      confirmLabel: 'Skip it',
      cancelLabel: 'Cancel',
      tone: 'warning',
    });
    if (!yes) return;
    setBusy(true);
    try {
      await devActivatePayout();
      router.replace('/');
    } catch (caught) {
      setError((caught as { displayMessage?: string })?.displayMessage
        ?? 'The server does not allow that. Set DEV_ALLOW_FORCE_CHECKIN="true" in Backend/.env.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <Box style={styles.centre}><Spinner color={c.accent} /></Box>
      </Screen>
    );
  }

  /* Submitted, and Razorpay has not answered yet. Not a form — there is
     nothing left to type, and re-offering one would invite a second account. */
  const waiting = state?.status === 'submitted' || state?.status === 'under_review';

  return (
    <Screen scroll={false} padX={0} background="bg">
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="pageTitle">
          {waiting ? 'We could not finish setting this up' : 'Where should we send your money?'}
        </Text>

        <Text color="textSecondary" style={styles.lede}>
          {waiting
            ? 'We have your details but could not register them with our payments partner. '
              + 'Try again, or enter them once more.'
            : 'You have a hotel on Lampose, so guests pay for their stay through us and we '
              + 'send it to you after they check in. We just need the account it should go to.'}
        </Text>

        {state && state.settlementsWaiting > 0 && (
          <Card style={{ backgroundColor: c.warningTint, borderColor: c.warningFill }}>
            <Text variant="cardTitle" color="warningInk">
              {state.settlementsWaiting} booking{state.settlementsWaiting === 1 ? '' : 's'} waiting to be paid out
            </Text>
            <Text variant="caption" color="warningInk">
              Guests have already paid. We are holding your share until this is done.
            </Text>
          </Card>
        )}

        {state?.status === 'rejected' && !!state.rejectionReason && (
          <Card style={{ backgroundColor: c.errorTint, borderColor: c.error }}>
            <Text variant="cardTitle" color="errorInk">Razorpay could not verify this</Text>
            <Text variant="caption" color="errorInk">{state.rejectionReason}</Text>
          </Card>
        )}

        {waiting ? (
          <Box style={styles.stack}>
            <Card>
              <Text variant="cardTitle">{state?.legalBusinessName}</Text>
              <Text variant="caption" color="textSecondary">
                {state?.beneficiaryName} · ••••{state?.accountLast4} · {state?.ifsc}
              </Text>
            </Card>
            <Button
              label={busy ? 'Checking…' : 'Check again'}
              variant="secondary"
              disabled={busy}
              onPress={() => {
                setBusy(true);
                refreshPayoutOnboarding()
                  .then((next) => { setState(next); if (!next.required) router.replace('/'); })
                  .catch(() => setError('We could not reach Razorpay just now.'))
                  .finally(() => setBusy(false));
              }}
            />
          </Box>
        ) : (
          <Box style={styles.stack}>
            {FIELDS.map((field) => (
              <Input
                key={field.key}
                label={field.label}
                placeholder={field.hint}
                value={form[field.key]}
                onChangeText={set(field.key)}
                autoCapitalize={field.caps ? 'characters' : 'words'}
                /* An account number is the only digits-only field left; the
                   email and PIN-code branches went with the fields. */
                keyboardType={field.key === 'accountNumber' ? 'number-pad' : 'default'}
              />
            ))}

            <Text variant="caption" color="textTertiary">
              We keep only the last four digits of your account number — our payments partner
              holds the rest. You do not need a Razorpay account of your own.
            </Text>

            <Button
              label={busy ? 'Sending…' : 'Save and continue'}
              disabled={busy}
              onPress={() => { void submit(); }}
            />
          </Box>
        )}

        {!!error && (
          <Text variant="caption" color="errorInk" style={styles.error}>{error}</Text>
        )}

        {/* DEVELOPMENT ONLY — see `devSkip`. Both gates: a preview build, and
            a server that says it allows it. */}
        {PREVIEW_CONTROLS && state?.devActivateAllowed && (
          <Box style={styles.dev}>
            <Button
              label="🛠 DEV: skip and mark me payable"
              variant="secondary"
              disabled={busy}
              onPress={() => { void devSkip(); }}
            />
            <Text variant="caption" color="textTertiary" center>
              Development only — writes a fake payout account, no real payout can reach it
            </Text>
          </Box>
        )}
      </KeyboardAwareScrollViewCompat>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { ...centred },
  body: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 48, gap: 14 },
  lede: { marginBottom: 2 },
  stack: { gap: 12 },
  error: { marginTop: 4 },
  dev: { gap: 6, marginTop: 20 },
});
