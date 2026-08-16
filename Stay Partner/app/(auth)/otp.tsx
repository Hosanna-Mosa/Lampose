import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  TextButton,
  IconButton,
  Icon,
  OTPInput,
  Toast,
  formatPhone,
} from '@/components/ui';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

const CODE_LENGTH = 6;
/** Seconds before "Resend code" becomes available. */
const RESEND_AFTER = 30;
/** Seconds before the code itself stops working. */
const CODE_TTL = 90;
/** Stands in for the code the backend would have sent. */
const DEMO_CODE = '482915';

function mmss(total: number) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * OTP verification — mid-entry, verifying, rejected, and resent are real states
 * driven by the code, a resend countdown, and a code lifetime.
 */
export default function OtpScreen() {
  const c = useColors();
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const [resendIn, setResendIn] = useState(RESEND_AFTER);
  const [age, setAge] = useState(0);
  const [resent, setResent] = useState(false);
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One ticker drives both the resend countdown and the code's own lifetime.
  useEffect(() => {
    const id = setInterval(() => {
      setResendIn((s) => (s > 0 ? s - 1 : 0));
      setAge((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => {
    if (verifyTimer.current) clearTimeout(verifyTimer.current);
  }, []);

  const complete = code.length === CODE_LENGTH;
  const expired = age >= CODE_TTL;

  const verify = () => {
    if (!complete || verifying) return;
    setVerifying(true);
    setToast(null);

    verifyTimer.current = setTimeout(() => {
      setVerifying(false);
      if (expired) {
        setInvalid(true);
        setToast({ message: 'That code has expired. Request a new one.' });
      } else if (code !== DEMO_CODE) {
        setInvalid(true);
        setToast({ message: "That code isn't right. Check the message and try again." });
      } else {
        router.replace('/profile-setup');
      }
    }, 1200);
  };

  const resend = () => {
    setCode('');
    setInvalid(false);
    setToast(null);
    setResendIn(RESEND_AFTER);
    setAge(0);
    setResent(true);
  };

  const display = phone ? formatPhone(phone.replace(/\D/g, '')) : '98765 43210';

  return (
    <Screen scroll={false} padX={24} contentStyle={styles.fill}>
      {toast ? <Toast message={toast.message} tone="error" onDismiss={() => setToast(null)} /> : null}

      <View style={styles.backRow}>
        {router.canGoBack() ? (
          <IconButton
            name="chevron-left"
            label="Go back"
            color={verifying ? c.textTertiary : c.textPrimary}
            onPress={() => router.back()}
          />
        ) : null}
      </View>

      <Text variant="pageTitleSm" style={styles.title}>
        Verify your number
      </Text>
      <Text variant="bodySm" color="textSecondary" style={styles.subtitle}>
        Enter the {CODE_LENGTH}-digit code sent to +91 {display}
      </Text>

      <OTPInput
        value={code}
        onChangeText={(next) => {
          setCode(next);
          if (invalid) setInvalid(false);
        }}
        length={CODE_LENGTH}
        invalid={invalid}
        disabled={verifying}
        autoFocus
      />

      <View style={styles.status}>
        {resendIn > 0 ? (
          resent ? (
            <View style={styles.resentRow}>
              <Icon name="check" size={14} color={c.success} strokeWidth={2.5} />
              <Text variant="link" style={{ color: c.successOnTint }}>
                Code resent · Resend again in {mmss(resendIn)}
              </Text>
            </View>
          ) : (
            <Text variant="link" color="textTertiary" style={styles.countdown}>
              Resend code in {mmss(resendIn)}
            </Text>
          )
        ) : (
          <TextButton label="Resend code" onPress={resend} />
        )}
      </View>

      <View style={styles.spacer} />

      <Button
        label={verifying ? 'Verifying…' : 'Verify'}
        onPress={verify}
        loading={verifying}
        disabled={!complete}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: {
    height: 44,
    justifyContent: 'center',
    marginLeft: -10,
    marginBottom: 12,
  },
  title: { marginBottom: 8 },
  subtitle: { lineHeight: 21, marginBottom: 26 },
  status: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 10,
  },
  countdown: { fontFamily: fonts.medium },
  resentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spacer: { flex: 1 },
});
