import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, TopHeader, Text, Button, Input, Card, Toast } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { ApiError, fetchMe } from '@/services';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/** Deliberately loose — the job is to catch typos, not to adjudicate RFC 5322. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Edit profile.
 *
 * This replaces the "never designed" stub. The design set genuinely has no
 * edit-profile form — it only ever drew the one-time setup screen shown after
 * OTP — but the endpoint behind it has existed since the partner account did:
 * `GET /partners/me` and `PATCH /partners/me`. The screen was the missing half,
 * not the API.
 *
 * ## Everything on it is the server's
 *
 * The form is seeded from `useAuth().partner`, which is itself `/me`, and then
 * re-fetched on mount so an edit made on another device is what you see. No
 * field has a hardcoded default; a blank one means the account is blank.
 *
 * ## The number is read-only, and that is not a limitation
 *
 * It is the account identifier, the OTP destination AND the key that links this
 * partner to their properties — `Property.ownerMobile` is how the portfolio is
 * scoped. Changing it is a verification flow needing a code sent to both the
 * old number and the new one, not a text edit. Presenting it as an editable
 * field that silently fails, or worse succeeds, is how somebody detaches
 * themselves from their own listings.
 */
export default function EditProfileScreen() {
  const c = useColors();
  const router = useRouter();
  const { partner, saveProfile } = useAuth();

  const [name, setName] = useState(partner?.name ?? '');
  const [email, setEmail] = useState(partner?.email ?? '');
  const [businessName, setBusinessName] = useState(partner?.businessName ?? '');
  const [emailTouched, setEmailTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'error' | 'success' } | null>(null);

  /*
   * Re-read on mount rather than trusting the cached session.
   *
   * The context's copy is written at sign-in and after each save. A profile
   * edited on a second device — or by support — is only visible if this asks.
   * Silent on failure: the form is already usable from the cached values, and
   * an error banner over a working form would be noise.
   */
  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((fresh) => {
        if (cancelled) return;
        setName(fresh.name ?? '');
        setEmail(fresh.email ?? '');
        setBusinessName(fresh.businessName ?? '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();

  const emailError =
    emailTouched && trimmedEmail.length > 0 && !EMAIL.test(trimmedEmail)
      ? 'Enter a valid email address.'
      : undefined;

  /* Nothing to save is not an error and not a round trip — it is the back
     button, which is what they pressed. */
  const dirty =
    trimmedName !== (partner?.name ?? '')
    || trimmedEmail !== (partner?.email ?? '')
    || businessName.trim() !== (partner?.businessName ?? '');

  const canSave = trimmedName.length > 0 && !emailError && !saving;

  const save = async () => {
    if (!canSave) return;
    if (!dirty) {
      router.back();
      return;
    }

    setSaving(true);
    setToast(null);
    try {
      /*
       * Sent even when empty, on purpose. This is the editor: clearing the
       * business name is how somebody removes one they no longer trade under,
       * and `PATCH` treats an explicit empty string as "clear" while an absent
       * key means "leave alone".
       */
      await saveProfile({
        name: trimmedName,
        email: trimmedEmail,
        businessName: businessName.trim(),
      });
      router.back();
    } catch (err) {
      /* The server's own sentence where it wrote one — only it knows whether
         the email was malformed or the session had expired underneath. */
      setToast({
        message: err instanceof ApiError ? err.displayMessage : 'We could not save that.',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      header={<TopHeader title="Edit profile" showBack />}
      background="bg"
      footer={
        <Button
          label={saving ? 'Saving…' : 'Save changes'}
          onPress={save}
          loading={saving}
          disabled={!canSave}
        />
      }
    >
      {toast ? (
        <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
      ) : null}

      <Input
        label="Full name"
        value={name}
        onChangeText={setName}
        placeholder="Anjali Rao"
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        containerStyle={styles.field}
      />

      <Input
        label="Business name"
        optional
        value={businessName}
        onChangeText={setBusinessName}
        placeholder="Apex Stays"
        autoCapitalize="words"
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

      {/* Read-only, with the reason attached rather than a dead grey box. */}
      <Card style={styles.lockedCard}>
        <Text variant="caption" color="textTertiary">
          Mobile number
        </Text>
        <Text style={[styles.lockedValue, { color: c.textPrimary }]}>
          {partner?.phone ?? '—'}
        </Text>
        <Text variant="caption" color="textSecondary" style={styles.lockedNote}>
          This is how you sign in, and it is what links your properties to this account.
          Changing it needs a code sent to both your old and new number — message Lampose and
          we will do it with you.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 18 },
  lockedCard: { padding: 14, gap: 4 },
  lockedValue: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  lockedNote: { lineHeight: 18, marginTop: 4 },
});
