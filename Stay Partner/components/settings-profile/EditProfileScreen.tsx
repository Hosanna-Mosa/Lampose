import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Tappable } from '@/components/common';
import { useRouter } from 'expo-router';
import { Screen, TopHeader, Text, Button, Input, Card, Toast, Icon } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { ApiError, fetchMe } from '@/services';
import { LocationRefused, locateMe } from '@/services/location/locateMe';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { boldBody } from '@/components/common/utils/styles';

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
export function EditProfileScreen() {
  const c = useColors();
  const router = useRouter();
  const { partner, saveProfile } = useAuth();

  const [name, setName] = useState(partner?.name ?? '');
  const [email, setEmail] = useState(partner?.email ?? '');
  const [businessName, setBusinessName] = useState(partner?.businessName ?? '');
  /* The OWNER's own address — not a property's, which lives on the property
     and is edited on the Property screen. Optional: nothing about trading
     depends on it, and an owner who declines it is not blocked. */
  const [line1, setLine1] = useState(partner?.address?.line1 ?? '');
  const [landmark, setLandmark] = useState(partner?.address?.landmark ?? '');
  const [city, setCity] = useState(partner?.address?.city ?? '');
  const [pincode, setPincode] = useState(partner?.address?.pincode ?? '');
  /* The pin, kept apart from the words: a fix always yields coordinates, and
     reverse geocoding is the half that can name nothing. */
  const [pin, setPin] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [locating, setLocating] = useState(false);
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
        setLine1(fresh.address?.line1 ?? '');
        setLandmark(fresh.address?.landmark ?? '');
        setCity(fresh.address?.city ?? '');
        setPincode(fresh.address?.pincode ?? '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const useMyLocation = async () => {
    setToast(null);
    setLocating(true);
    try {
      const found = await locateMe();
      setPin(found.location);
      /* Only fills what is still empty — an owner correcting one line does not
         want the rest rewritten by the road their phone is on. */
      const fill = (current: string, next: string) => (current.trim() ? current : next);
      setLine1((v) => fill(v, found.fields.line1));
      setLandmark((v) => fill(v, found.fields.landmark));
      setCity((v) => fill(v, found.fields.city));
      setPincode((v) => fill(v, found.fields.pincode));
      setToast({
        message: found.namedNothing
          ? 'Pin saved, but we could not name this spot — type the address.'
          : 'Filled from your location. Check it before saving.',
        tone: found.namedNothing ? 'error' : 'success',
      });
    } catch (err) {
      setToast({
        message:
          err instanceof LocationRefused
            ? err.message
            : 'We could not get your location.',
        tone: 'error',
      });
    } finally {
      setLocating(false);
    }
  };

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
    || businessName.trim() !== (partner?.businessName ?? '')
    || line1.trim() !== (partner?.address?.line1 ?? '')
    || landmark.trim() !== (partner?.address?.landmark ?? '')
    || city.trim() !== (partner?.address?.city ?? '')
    || pincode.trim() !== (partner?.address?.pincode ?? '')
    || pin !== undefined;

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
        /*
         * Only when there is a first line, and `null` when it has been emptied.
         *
         * An address whose street is blank is one the server refuses, so
         * sending a landmark on its own would block a Save over a field the
         * owner deliberately left alone. Clearing the first line is how an
         * address is removed — the same gesture as clearing a business name.
         */
        address: line1.trim()
          ? {
              kind: 'home' as const,
              line1: line1.trim(),
              landmark: landmark.trim(),
              city: city.trim(),
              pincode: pincode.trim(),
              /* Omitted when the crosshair was not used, so saving a renamed
                 landmark cannot drop a pin captured earlier. */
              ...(pin ? { location: pin } : null),
            }
          : partner?.address
            ? null
            : undefined,
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

      {/* Where the OWNER is. A property's address is on the property; this is
          for correspondence, and it is what a payout or a dispute is checked
          against. Optional throughout — an owner who skips it still trades. */}
      {/* Above the address fields rather than beside one: it fills several. */}
      <Tappable
        accessibilityRole="button"
        accessibilityLabel="Use my current location"
        accessibilityState={{ busy: locating, disabled: locating }}
        disabled={locating}
        onPress={useMyLocation}
        style={[styles.locate, { borderColor: c.accent, backgroundColor: c.accentTint }]}
      >
        <Icon name="crosshair" size={18} color={c.accent} />
        <Text variant="label" style={{ color: c.accent, fontFamily: fonts.semibold }}>
          {locating ? 'Finding you…' : 'Use my current location'}
        </Text>
      </Tappable>
      <Input
        label="Your address"
        optional
        value={line1}
        onChangeText={setLine1}
        placeholder="12-3-45, Danavaipeta"
        containerStyle={styles.field}
      />

      <Input
        label="Landmark"
        optional
        value={landmark}
        onChangeText={setLandmark}
        placeholder="Near the temple"
        containerStyle={styles.field}
      />

      <Input
        label="City"
        optional
        value={city}
        onChangeText={setCity}
        placeholder="Rajahmundry"
        autoCapitalize="words"
        containerStyle={styles.field}
      />

      <Input
        label="Pincode"
        optional
        value={pincode}
        onChangeText={setPincode}
        placeholder="533103"
        keyboardType="number-pad"
        maxLength={6}
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
  locate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    height: 48,
    marginBottom: 18,
  },
  field: { marginBottom: 18 },
  lockedCard: { padding: 14, gap: 4 },
  lockedValue: { ...boldBody },
  lockedNote: { lineHeight: 18, marginTop: 4 },
});
