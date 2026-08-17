import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Button, TextButton } from './Button';
import { Icon } from './Icon';
import { OTPInput } from './OTPInput';
import { FieldLabel } from './Field';
import { formatPhone, PHONE_LENGTH } from './PhoneField';
import { ApiError } from '@/services/api/client';
import { startGuestOtp, verifyGuestOtp } from '@/services/api/addCustomer.api';
import { useColors } from '@/hooks/useColors';

/** Overwritten by the server's own answer on the first send. */
const CODE_LENGTH = 6;
const RESEND_AFTER = 30;

type Props = {
  /** Raw ten digits, as typed. Normalised to E.164 before it is sent. */
  phone: string;
  verified: boolean;
  onVerifiedChange: (next: boolean) => void;
};

/**
 * The last step of collecting a guest's KYC by hand: not a postal PIN code,
 * a code the owner texts to the guest's own number and has them read back,
 * confirming the person behind these details actually holds that phone.
 *
 * Shared by the request KYC screen and manual "Add customer" entry — both
 * end their form with the same confirmation step.
 */
export function VerificationCodeField({ phone, verified, onVerifiedChange }: Props) {
  const c = useColors();
  const [sent, setSent] = useState(verified);
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [length, setLength] = useState(CODE_LENGTH);
  const [resendIn, setResendIn] = useState(RESEND_AFTER);

  useEffect(() => {
    if (!sent || verified) return;
    const id = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [sent, verified]);

  const phoneReady = phone.length === PHONE_LENGTH;
  const display = formatPhone(phone);
  /* The server takes E.164 and normalises anyway; sending the ten digits alone
     would have it guess a country. */
  const e164 = `+91${phone}`;

  /**
   * Sends a real code.
   *
   * This was a 700ms `setTimeout` that flipped a flag, and the code it checked
   * against was the literal '246810'. Both are gone: `POST /partners/
   * guest-otp/start` texts six digits the server generated and stored as a
   * salted hash, and the cooldown below is the one the server reports rather
   * than a constant this file picked.
   */
  const send = async (isResend = false) => {
    if (!phoneReady || sending) return;
    setSending(true);
    setProblem(null);
    setInvalid(false);
    if (isResend) setCode('');

    try {
      const challenge = await startGuestOtp(e164);
      setLength(challenge.otpLength);
      setResendIn(challenge.resendInSeconds);
      setSent(true);
    } catch (err) {
      /*
       * A cooldown is not a failure to hide the boxes for. The server refuses
       * a second send within a minute, and one is already on the guest's
       * phone — so the flow advances and the countdown says when another can
       * be asked for.
       */
      if (err instanceof ApiError && err.status === 429) {
        const payload = err.payload as { retryAfter?: number } | null;
        setResendIn(payload?.retryAfter ?? 60);
        setSent(true);
      } else {
        setProblem(err instanceof ApiError ? err.displayMessage : 'We could not send that code.');
      }
    } finally {
      setSending(false);
    }
  };

  const resend = () => send(true);

  /**
   * Verifies against the server, on the last digit.
   *
   * A wrong code does NOT clear the boxes — one mistyped digit should be
   * fixable, not retyped from scratch with a guest waiting.
   */
  const change = async (next: string) => {
    setCode(next);
    if (invalid) setInvalid(false);
    if (problem) setProblem(null);
    if (next.length !== length) return;

    try {
      await verifyGuestOtp(e164, next);
      onVerifiedChange(true);
    } catch (err) {
      setInvalid(true);
      if (err instanceof ApiError) {
        const payload = (err.payload ?? {}) as { attemptsLeft?: number };
        if (err.code === 'OTP_EXPIRED') setProblem('That code has expired. Send a new one.');
        else if (err.code === 'OTP_LOCKED') setProblem('Too many tries. Send a new code.');
        else if (typeof payload.attemptsLeft === 'number' && payload.attemptsLeft > 0) {
          setProblem(`That code isn't right — ${payload.attemptsLeft} left.`);
        } else setProblem(err.displayMessage);
      }
    }
  };

  if (verified) {
    return (
      <View>
        <FieldLabel>Verification code</FieldLabel>
        <View style={[styles.verifiedRow, { borderColor: c.success, backgroundColor: c.successTint }]}>
          <Icon name="check-circle" size={18} color={c.success} />
          <Text variant="bodySm" color="successOnTint" style={styles.verifiedText}>
            Verified with the guest at +91 {display}
          </Text>
        </View>
      </View>
    );
  }

  if (!sent) {
    return (
      <View>
        <FieldLabel>Verification code</FieldLabel>
        <Text variant="badge" color="textSecondary" style={styles.hint}>
          {phoneReady
            ? `Send a ${length}-digit code to +91 ${display} and have the guest read it back to confirm these details.`
            : 'Enter the guest’s phone number above to send a verification code.'}
        </Text>
        <Button
          label={sending ? 'Sending…' : 'Send verification code'}
          variant="secondary"
          size="sm"
          onPress={() => send()}
          loading={sending}
          disabled={!phoneReady}
          fullWidth={false}
        />
      </View>
    );
  }

  return (
    <View>
      <FieldLabel>Verification code</FieldLabel>
      <Text variant="badge" color="textSecondary" style={styles.hint}>
        Code sent to +91 {display}
      </Text>
      <OTPInput
        length={length}
        value={code}
        onChangeText={change}
        invalid={invalid}
        accessibilityLabel="Verification code"
      />
      {/* The server's own sentence where it wrote one — only it knows whether
          the code expired, was locked, or how many tries are left. The generic
          line is the fallback for a failure it never spoke about. */}
      {problem ? (
        <Text variant="badge" color="error" style={styles.error}>
          {problem}
        </Text>
      ) : invalid ? (
        <Text variant="badge" color="error" style={styles.error}>
          That code isn&apos;t right. Check with the guest and try again.
        </Text>
      ) : null}
      <View style={styles.resendRow}>
        {resendIn > 0 ? (
          <Text variant="link" color="textTertiary">
            Resend code in {resendIn}s
          </Text>
        ) : (
          <TextButton label="Resend code" onPress={resend} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { lineHeight: 17, marginBottom: 10 },
  error: { marginTop: 8 },
  resendRow: { minHeight: 36, justifyContent: 'center', marginTop: 4 },
  verifiedRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verifiedText: { flex: 1 },
});
