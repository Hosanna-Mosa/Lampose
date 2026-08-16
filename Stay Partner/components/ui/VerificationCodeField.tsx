import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Button, TextButton } from './Button';
import { Icon } from './Icon';
import { OTPInput } from './OTPInput';
import { FieldLabel } from './Field';
import { formatPhone, PHONE_LENGTH } from './PhoneField';
import { useColors } from '@/hooks/useColors';

const CODE_LENGTH = 6;
/** Seconds before "Resend code" becomes available again. */
const RESEND_AFTER = 30;
/** Stands in for the code the backend would text the guest — same idea as login's own demo code. */
const DEMO_CODE = '246810';

type Props = {
  /** Raw digits — where the code is "sent." */
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
  const [resendIn, setResendIn] = useState(RESEND_AFTER);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sent || verified) return;
    const id = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [sent, verified]);

  useEffect(
    () => () => {
      if (sendTimer.current) clearTimeout(sendTimer.current);
    },
    [],
  );

  const phoneReady = phone.length === PHONE_LENGTH;
  const display = formatPhone(phone);

  const send = () => {
    if (!phoneReady || sending) return;
    setSending(true);
    sendTimer.current = setTimeout(() => {
      setSending(false);
      setSent(true);
      setResendIn(RESEND_AFTER);
    }, 700);
  };

  const resend = () => {
    setCode('');
    setInvalid(false);
    setResendIn(RESEND_AFTER);
  };

  const change = (next: string) => {
    setCode(next);
    if (invalid) setInvalid(false);
    if (next.length === CODE_LENGTH) {
      if (next === DEMO_CODE) onVerifiedChange(true);
      else setInvalid(true);
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
            ? `Send a ${CODE_LENGTH}-digit code to +91 ${display} and have the guest read it back to confirm these details.`
            : 'Enter the guest’s phone number above to send a verification code.'}
        </Text>
        <Button
          label={sending ? 'Sending…' : 'Send verification code'}
          variant="secondary"
          size="sm"
          onPress={send}
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
        length={CODE_LENGTH}
        value={code}
        onChangeText={change}
        invalid={invalid}
        accessibilityLabel="Verification code"
      />
      {invalid ? (
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
