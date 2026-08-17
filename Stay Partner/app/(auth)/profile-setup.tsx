import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, Input, Toast } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/services';

/** Deliberately loose — the job is to catch typos, not to adjudicate RFC 5322. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Profile setup — runs once, after first successful verification.
 *
 * No back affordance: the number is already verified at this point, so there is
 * nothing behind this screen to return to.
 *
 * ## It writes to the account now
 *
 * Continue used to be `router.replace('/')` — the name and email were typed,
 * validated, and dropped on unmount. They go to `PATCH /partners/me`, which is
 * also what sets `profileCompletedAt`; that timestamp is what stops this screen
 * being shown again on the next launch.
 *
 * ## Nothing is optimistic
 *
 * The name is what Lampose staff will see against every property and every
 * payout, so it must actually be stored before the app moves on. A failure
 * keeps both fields exactly as typed — this is the one form in the flow where
 * losing the text means somebody re-enters their own name on a bad connection.
 */
export default function ProfileSetupScreen() {
  const router = useRouter();
  const { saveProfile, partner } = useAuth();

  /* Prefilled from whatever the account already holds. A partner who got here,
     backgrounded the app and came back should not retype what they had. */
  const [name, setName] = useState(partner?.name ?? '');
  const [email, setEmail] = useState(partner?.email ?? '');
  const [emailTouched, setEmailTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string } | null>(null);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();

  const emailError =
    emailTouched && trimmedEmail.length > 0 && !EMAIL.test(trimmedEmail)
      ? 'Enter a valid email address.'
      : undefined;

  // Email is optional, but a half-typed one still blocks — silently dropping it
  // would lose the address the owner thinks they just saved.
  const canContinue = trimmedName.length > 0 && !emailError && !saving;

  const submit = async () => {
    if (!canContinue) return;
    setSaving(true);
    setToast(null);
    try {
      await saveProfile({ name: trimmedName, email: trimmedEmail });
      router.replace('/');
    } catch (error) {
      setToast({
        message: error instanceof ApiError
          ? error.displayMessage
          : 'We could not save that. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll={false} padX={24} contentStyle={styles.fill}>
      {toast ? <Toast message={toast.message} tone="error" onDismiss={() => setToast(null)} /> : null}

      <Text variant="pageTitleSm" style={styles.title}>
        Set up your profile
      </Text>
      <Text variant="bodySm" color="textSecondary" style={styles.subtitle}>
        This is what guests and support will see.
      </Text>

      <Input
        label="Full name"
        value={name}
        onChangeText={setName}
        placeholder="Anjali Rao"
        autoFocus
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        returnKeyType="next"
        containerStyle={styles.field}
      />

      <Input
        label="Email"
        optional
        value={email}
        onChangeText={(next) => {
          setEmail(next);
          if (emailTouched) setEmailTouched(false);
        }}
        onBlur={() => setEmailTouched(true)}
        error={emailError}
        placeholder="you@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        textContentType="emailAddress"
        autoComplete="email"
        containerStyle={styles.field}
      />

      <View style={styles.spacer} />

      <Button
        label={saving ? 'Saving…' : 'Continue'}
        onPress={submit}
        loading={saving}
        disabled={!canContinue}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { marginBottom: 8 },
  subtitle: { lineHeight: 21, marginBottom: 30 },
  field: { marginBottom: 20 },
  spacer: { flex: 1 },
});
