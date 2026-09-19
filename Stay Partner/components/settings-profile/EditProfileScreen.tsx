import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
 * Modern redesign layout keeping all existing data, state, and API integration.
 */
export function EditProfileScreen() {
  const c = useColors();
  const router = useRouter();
  const { partner, saveProfile } = useAuth();

  const [name, setName] = useState(partner?.name ?? '');
  const [email, setEmail] = useState(partner?.email ?? '');
  const [businessName, setBusinessName] = useState(partner?.businessName ?? '');
  const [line1, setLine1] = useState(partner?.address?.line1 ?? '');
  const [landmark, setLandmark] = useState(partner?.address?.landmark ?? '');
  const [city, setCity] = useState(partner?.address?.city ?? '');
  const [pincode, setPincode] = useState(partner?.address?.pincode ?? '');
  const [pin, setPin] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [locating, setLocating] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'error' | 'success' } | null>(null);

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
      await saveProfile({
        name: trimmedName,
        email: trimmedEmail,
        businessName: businessName.trim(),
        address: line1.trim()
          ? {
              kind: 'home' as const,
              line1: line1.trim(),
              landmark: landmark.trim(),
              city: city.trim(),
              pincode: pincode.trim(),
              ...(pin ? { location: pin } : null),
            }
          : partner?.address
            ? null
            : undefined,
      });
      router.back();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.displayMessage : 'We could not save that.',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const initialLetter = (name.trim() || partner?.name?.trim() || 'P')[0]?.toUpperCase() ?? 'P';

  return (
    <Screen
      header={<TopHeader title="Edit profile" showBack />}
      background="bg"
      footer={
        <Button
          label={saving ? 'Saving changes…' : 'Save changes'}
          onPress={save}
          loading={saving}
          disabled={!canSave}
        />
      }
    >
      <View style={styles.container}>
        {toast ? (
          <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
        ) : null}

        {/* Hero Avatar Card */}
        <Card style={styles.heroCard}>
          <View style={styles.heroContent}>
            <View style={styles.avatarContainer}>
              <View style={[styles.avatarCircle, { backgroundColor: c.accent }]}>
                <Text style={styles.avatarText}>{initialLetter}</Text>
              </View>
              <View style={[styles.avatarEditBadge, { backgroundColor: c.surface, borderColor: c.accent }]}>
                <Icon name="edit" size={12} color={c.accent} />
              </View>
            </View>
            <View style={styles.heroTextContainer}>
              <Text style={[styles.heroName, { color: c.textPrimary }]}>
                {name.trim() || partner?.name || 'Partner Account'}
              </Text>
              <View style={styles.badgeRow}>
                <View style={[styles.verifiedBadge, { backgroundColor: c.accentTint }]}>
                  <Icon name="check-circle" size={12} color={c.accent} />
                  <Text style={[styles.verifiedText, { color: c.accent }]}>Verified Owner</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Personal Details Section */}
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconBg, { backgroundColor: c.accentTint }]}>
              <Icon name="user" size={18} color={c.accent} />
            </View>
            <View>
              <Text variant="label" style={[styles.sectionTitle, { color: c.textPrimary }]}>
                Personal Details
              </Text>
              <Text variant="caption" color="textSecondary">
                Your basic account information
              </Text>
            </View>
          </View>

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
        </Card>

        {/* Correspondence Address Section */}
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconBg, { backgroundColor: c.accentTint }]}>
              <Icon name="map-pin" size={18} color={c.accent} />
            </View>
            <View>
              <Text variant="label" style={[styles.sectionTitle, { color: c.textPrimary }]}>
                Correspondence Address
              </Text>
              <Text variant="caption" color="textSecondary">
                Used for payouts & official communication
              </Text>
            </View>
          </View>

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
              {locating ? 'Finding your location…' : 'Use my current location'}
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

          <View style={styles.row}>
            <Input
              label="City"
              optional
              value={city}
              onChangeText={setCity}
              placeholder="Rajahmundry"
              autoCapitalize="words"
              containerStyle={styles.halfField}
            />

            <Input
              label="Pincode"
              optional
              value={pincode}
              onChangeText={setPincode}
              placeholder="533103"
              keyboardType="number-pad"
              maxLength={6}
              containerStyle={styles.halfField}
            />
          </View>
        </Card>

        {/* Account & Security Section */}
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconBg, { backgroundColor: c.accentTint }]}>
              <Icon name="lock" size={18} color={c.accent} />
            </View>
            <View>
              <Text variant="label" style={[styles.sectionTitle, { color: c.textPrimary }]}>
                Account & Security
              </Text>
              <Text variant="caption" color="textSecondary">
                Registered account credentials
              </Text>
            </View>
          </View>

          <View style={[styles.lockedBox, { backgroundColor: c.bg, borderColor: c.borderCard }]}>
            <View style={styles.lockedHeader}>
              <Text variant="caption" color="textTertiary">
                Mobile number
              </Text>
              <View style={[styles.lockedBadge, { backgroundColor: c.accentTint }]}>
                <Text style={[styles.lockedBadgeText, { color: c.accent }]}>Primary OTP Number</Text>
              </View>
            </View>
            <Text style={[styles.lockedValue, { color: c.textPrimary }]}>
              {partner?.phone ?? '—'}
            </Text>
            <Text variant="caption" color="textSecondary" style={styles.lockedNote}>
              This is your sign-in number linking your properties. To update your mobile number, contact Lampose support for dual-code verification.
            </Text>
          </View>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingBottom: 24,
  },
  heroCard: {
    padding: 16,
    borderRadius: 16,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: '#FFFFFF',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextContainer: {
    flex: 1,
    gap: 4,
  },
  heroName: {
    fontSize: 18,
    fontFamily: fonts.bold,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  verifiedText: {
    fontSize: 11,
    fontFamily: fonts.semibold,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 2,
  },
  sectionIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  locate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    height: 44,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
    marginBottom: 0,
  },
  field: {
    marginBottom: 0,
  },
  lockedBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  lockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lockedValue: {
    ...boldBody,
    fontSize: 15,
  },
  lockedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  lockedBadgeText: {
    fontSize: 11,
    fontFamily: fonts.medium,
  },
  lockedNote: {
    lineHeight: 18,
    marginTop: 2,
  },
});

