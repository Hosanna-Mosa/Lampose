import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, Input } from '@/components/ui';

/** Deliberately loose — the job is to catch typos, not to adjudicate RFC 5322. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Profile setup — runs once, after first successful verification.
 *
 * No back affordance: the number is already verified at this point, so there is
 * nothing behind this screen to return to.
 */
export default function ProfileSetupScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();

  const emailError =
    emailTouched && trimmedEmail.length > 0 && !EMAIL.test(trimmedEmail)
      ? 'Enter a valid email address.'
      : undefined;

  // Email is optional, but a half-typed one still blocks — silently dropping it
  // would lose the address the owner thinks they just saved.
  const canContinue = trimmedName.length > 0 && !emailError;

  return (
    <Screen scroll={false} padX={24} contentStyle={styles.fill}>
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

      <Button label="Continue" onPress={() => router.replace('/')} disabled={!canContinue} />
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
