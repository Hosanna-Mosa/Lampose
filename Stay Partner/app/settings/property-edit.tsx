import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Screen,
  TopHeader,
  Text,
  Input,
  Select,
  Segmented,
  Chip,
  ChipRow,
  Button,
  Toast,
  Skeleton,
  ErrorState,
  Icon,
  FieldLabel,
  FieldError,
} from '@/components/ui';
import { PropertyCategoryFields } from '@/components/PropertyCategoryFields';
import {
  ApiError,
  fetchMyProperty,
  updateMyProperty,
  uploadPropertyImages,
  type BackendListing,
} from '@/services';
import { useColors } from '@/hooks/useColors';

/**
 * Add or correct whatever onboarding left blank.
 *
 * The screen this replaces (`settings/property.tsx`) is deliberately
 * read-only and explains why: v1 onboarding writes need an administrator's
 * grant. This one exists because a purpose-built write DOES fit an owner's
 * session — not that grant, a narrower one scoped to a property this
 * partner's own phone number owns. See `Backend/src/modules/partners/
 * propertyEdit.controller.js` for the actual boundary.
 *
 * There is no review step before a save lands on the live listing — that was
 * a deliberate product decision, not an oversight, and it is why every field
 * here validates itself rather than trusting the form to have gotten it right.
 */

/* Codes, matching the schema enum — Backend/src/shared/constants/categories.js.
   CATEGORY_LABEL is what the picker shows. */
const CATEGORIES = ['PG_HOSTEL', 'BACHELOR', 'HOTEL', 'COLIVE'] as const;
const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  PG_HOSTEL: 'PG / Hostel',
  BACHELOR: 'Bachelor',
  HOTEL: 'Hotels',
  COLIVE: 'House / Co-live',
};
const STAY_TYPES = ['Short Stay', 'Long Stay'] as const;
const SHORT_STAY_DURATIONS = [
  '1 Day', '2 Days', '3 Days', '4 Days', '5 Days', '6 Days', '7 Days', '1-7 Days',
] as const;
const LONG_STAY_DURATIONS = ['1 Month', '3 Months', '6 Months', '1 Year', '1 Month+'] as const;

const ALL_AMENITIES = [
  'WiFi', 'AC', 'Food', 'Elevator / Lift', 'TV', 'Housekeeping', 'Power Backup',
  'RO Water', 'Washing Machine', 'CCTV Security', 'Covered Parking', 'Gym',
  'Personal Lockers', 'Kitchen Setup',
];

const MAX_PHOTOS = 10;

type FormState = {
  name: string;
  place: string;
  ownerName: string;
  ownerMobile: string;
  category: (typeof CATEGORIES)[number];
  stayType: (typeof STAY_TYPES)[number];
  shortStayDuration: string;
  longStayDuration: string;
  dailyPrice: string;
  monthlyPrice: string;
  deposit: string;
  address: string;
  description: string;
  amenities: string[];
  images: string[];
  categoryDetails: Record<string, any>;
};

function toFormState(property: BackendListing): FormState {
  return {
    name: property.name ?? '',
    place: property.place ?? '',
    ownerName: property.ownerName ?? '',
    ownerMobile: property.ownerMobile ?? '',
    category: (CATEGORIES as readonly string[]).includes(property.category ?? '')
      ? (property.category as (typeof CATEGORIES)[number])
      : 'PG_HOSTEL',
    stayType: property.stayType === 'Short Stay' ? 'Short Stay' : 'Long Stay',
    shortStayDuration: property.shortStayDuration ?? '1-7 Days',
    longStayDuration: property.longStayDuration ?? '1 Month+',
    dailyPrice: property.dailyPrice ? String(property.dailyPrice) : '',
    monthlyPrice: property.monthlyPrice ? String(property.monthlyPrice) : '',
    deposit: property.deposit ? String(property.deposit) : '',
    address: property.address ?? '',
    description: property.description ?? '',
    amenities: Array.isArray(property.amenities) ? [...property.amenities] : [],
    images: Array.isArray(property.images) ? [...property.images] : [],
    categoryDetails:
      property.details && typeof property.details === 'object' ? { ...property.details } : {},
  };
}

export default function PropertyEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const c = useColors();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'error' | 'success' } | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setLoadError('No property was specified.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const property = await fetchMyProperty(id);
      setForm(toFormState(property));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.displayMessage : 'We could not load this property.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const canSave =
    Boolean(form) &&
    Boolean(form?.name.trim()) &&
    Boolean(form?.place.trim()) &&
    Boolean(form?.ownerName.trim()) &&
    Boolean(form?.ownerMobile.trim()) &&
    !saving;

  const submit = async () => {
    if (!id || !form || !canSave) return;
    setSaving(true);
    setToast(null);
    try {
      const updated = await updateMyProperty(id, {
        name: form.name.trim(),
        place: form.place.trim(),
        ownerName: form.ownerName.trim(),
        ownerMobile: form.ownerMobile.trim(),
        category: form.category,
        stayType: form.stayType,
        shortStayDuration: form.shortStayDuration.trim() || undefined,
        longStayDuration: form.longStayDuration.trim() || undefined,
        dailyPrice: Number(form.dailyPrice) || 0,
        monthlyPrice: Number(form.monthlyPrice) || 0,
        rent: form.stayType === 'Short Stay' ? Number(form.dailyPrice) || 0 : Number(form.monthlyPrice) || 0,
        deposit: Number(form.deposit) || 0,
        address: form.address.trim(),
        description: form.description.trim(),
        images: form.images,
        amenities: form.amenities,
        categoryDetails: form.categoryDetails,
      });
      setForm(toFormState(updated));
      setToast({ message: 'Saved.', tone: 'success' });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.displayMessage : 'We could not save that. Please try again.',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      header={<TopHeader title="Edit property details" showBack />}
      background="bg"
      footer={
        form ? (
          <Button label={saving ? 'Saving…' : 'Save changes'} onPress={submit} loading={saving} disabled={!canSave} />
        ) : undefined
      }
    >
      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}

      {loadError ? (
        <ErrorState title="We could not load this" body={loadError} onRetry={load} />
      ) : loading || !form ? (
        <View style={styles.stack}>
          <Skeleton width="100%" height={52} radius={12} />
          <Skeleton width="100%" height={52} radius={12} />
          <Skeleton width="100%" height={52} radius={12} />
          <Skeleton width="100%" height={120} radius={12} />
        </View>
      ) : (
        <View style={styles.stack}>
          <Text variant="caption" color="textSecondary" style={styles.intro}>
            Fill in whatever onboarding missed, or fix anything that's wrong. Changes go live as soon
            as you save.
          </Text>

          <Section title="Basic details">
            <Input
              label="Property / accommodation name"
              value={form.name}
              onChangeText={(name) => setForm((f) => f && { ...f, name })}
              containerStyle={styles.field}
            />
            <Input
              label="Place / city / area"
              value={form.place}
              onChangeText={(place) => setForm((f) => f && { ...f, place })}
              containerStyle={styles.field}
            />
            <Select
              label="Category"
              options={CATEGORIES}
              format={(c) => CATEGORY_LABEL[c]}
              value={form.category}
              onChange={(category) => setForm((f) => f && { ...f, category })}
            />
            <View style={styles.field} />
            <Input
              label="Owner full name"
              value={form.ownerName}
              onChangeText={(ownerName) => setForm((f) => f && { ...f, ownerName })}
              autoCapitalize="words"
              containerStyle={styles.field}
            />
            <Input
              label="Owner mobile number"
              value={form.ownerMobile}
              onChangeText={(ownerMobile) => setForm((f) => f && { ...f, ownerMobile })}
              keyboardType="phone-pad"
              containerStyle={styles.field}
            />
            <Text variant="badge" color="textTertiary" style={styles.hint}>
              This can only be set to the number you signed in with. To move this listing to a
              different number, contact Lampose support.
            </Text>
          </Section>

          <Section title="Stay type & pricing">
            <View style={styles.field}>
              <FieldLabel>Stay type</FieldLabel>
              <Segmented options={STAY_TYPES} value={form.stayType} onChange={(stayType) => setForm((f) => f && { ...f, stayType })} />
            </View>

            {form.stayType === 'Short Stay' ? (
              <>
                <Select
                  label="Duration option"
                  options={SHORT_STAY_DURATIONS}
                  value={form.shortStayDuration as (typeof SHORT_STAY_DURATIONS)[number]}
                  onChange={(shortStayDuration) => setForm((f) => f && { ...f, shortStayDuration })}
                />
                <View style={styles.field} />
                <Input
                  label="Price per day (₹)"
                  value={form.dailyPrice}
                  onChangeText={(text) => setForm((f) => f && { ...f, dailyPrice: text.replace(/[^\d]/g, '') })}
                  keyboardType="number-pad"
                  placeholder="e.g. 450"
                  containerStyle={styles.field}
                />
              </>
            ) : (
              <>
                <Select
                  label="Minimum duration"
                  options={LONG_STAY_DURATIONS}
                  value={form.longStayDuration as (typeof LONG_STAY_DURATIONS)[number]}
                  onChange={(longStayDuration) => setForm((f) => f && { ...f, longStayDuration })}
                />
                <View style={styles.field} />
                <Input
                  label="Price per month (₹)"
                  value={form.monthlyPrice}
                  onChangeText={(text) => setForm((f) => f && { ...f, monthlyPrice: text.replace(/[^\d]/g, '') })}
                  keyboardType="number-pad"
                  placeholder="e.g. 8500"
                  containerStyle={styles.field}
                />
              </>
            )}

            <Input
              label="Security deposit (₹)"
              optional
              value={form.deposit}
              onChangeText={(text) => setForm((f) => f && { ...f, deposit: text.replace(/[^\d]/g, '') })}
              keyboardType="number-pad"
              placeholder="e.g. 15000"
              containerStyle={styles.field}
            />
          </Section>

          <Section title="Location & description">
            <Input
              label="Complete street address"
              optional
              value={form.address}
              onChangeText={(address) => setForm((f) => f && { ...f, address })}
              multiline
              containerStyle={styles.field}
            />
            <Input
              label="Description"
              optional
              value={form.description}
              onChangeText={(description) => setForm((f) => f && { ...f, description })}
              multiline
              placeholder="What should a student know about this place?"
              containerStyle={styles.field}
            />
          </Section>

          <Section title="Photos">
            <PropertyPhotosField
              images={form.images}
              onChange={(images) => setForm((f) => f && { ...f, images })}
            />
          </Section>

          <Section title="Amenities">
            <ChipRow>
              {ALL_AMENITIES.map((amenity) => (
                <Chip
                  key={amenity}
                  label={amenity}
                  selected={form.amenities.includes(amenity)}
                  onPress={() => setForm((f) => {
                    if (!f) return f;
                    const has = f.amenities.includes(amenity);
                    return {
                      ...f,
                      amenities: has ? f.amenities.filter((a) => a !== amenity) : [...f.amenities, amenity],
                    };
                  })}
                />
              ))}
            </ChipRow>
          </Section>

          <Section title={`${form.category} details`}>
            <PropertyCategoryFields
              category={form.category}
              details={form.categoryDetails}
              onChange={(categoryDetails) => setForm((f) => f && { ...f, categoryDetails })}
            />
          </Section>
        </View>
      )}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" color="textTertiary" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * Picks, uploads and lists property photographs.
 *
 * Uploading happens on pick rather than on save — see `AadharUploadTile` for
 * why: a save button that also has to wait on a multi-photo upload stalls at
 * the moment an owner expects it to finish. The cost is an orphaned Cloudinary
 * image if the form is abandoned after a pick, which is the right side to
 * err on.
 */
function PropertyPhotosField({
  images,
  onChange,
}: {
  images: string[];
  onChange: (next: string[]) => void;
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = MAX_PHOTOS - images.length;

  const pick = async () => {
    if (busy || remaining <= 0) return;
    setError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access is needed to add pictures.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
      quality: 0.7,
    });

    if (picked.canceled || !picked.assets?.length) return;

    setBusy(true);
    try {
      const uploaded = await uploadPropertyImages(
        picked.assets.map((a) => ({ uri: a.uri, name: a.fileName ?? undefined, mimeType: a.mimeType ?? undefined })),
      );
      onChange([...images, ...uploaded.map((u) => u.url)].slice(0, MAX_PHOTOS));
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'That upload did not go through.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (url: string) => onChange(images.filter((u) => u !== url));

  return (
    <View>
      {images.length ? (
        <View style={styles.photoGrid}>
          {images.map((url, index) => (
            <View key={`${url}-${index}`} style={[styles.photoThumbWrap, { borderColor: c.borderCard }]}>
              <Image source={{ uri: url }} style={styles.photoThumb} resizeMode="cover" />
              {index === 0 ? (
                <View style={[styles.coverBadge, { backgroundColor: c.accent }]}>
                  <Text variant="badge" color="white">
                    Cover
                  </Text>
                </View>
              ) : null}
              <Pressable
                onPress={() => remove(url)}
                accessibilityRole="button"
                accessibilityLabel="Remove this photo"
                hitSlop={8}
                style={[styles.photoRemove, { backgroundColor: c.surface, borderColor: c.borderCard }]}
              >
                <Icon name="close" size={13} color={c.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {remaining > 0 ? (
        <Pressable
          onPress={pick}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Add property photos"
          style={[
            styles.photoTile,
            images.length ? styles.photoTileCompact : null,
            busy
              ? { borderColor: c.borderCard, backgroundColor: c.surfaceSunken }
              : { borderColor: c.border, borderStyle: 'dashed' },
          ]}
        >
          <Icon name={busy ? 'clock' : 'image'} size={20} color={c.textTertiary} />
          <Text variant="badge" color="textTertiary">
            {busy ? 'Uploading…' : images.length ? 'Add more photos' : 'Tap to add photos'}
          </Text>
        </Pressable>
      ) : null}

      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 4 },
  intro: { lineHeight: 18, marginBottom: 8 },
  section: { marginBottom: 22 },
  sectionTitle: { marginBottom: 10 },
  field: { marginBottom: 16 },
  hint: { marginTop: -10, marginBottom: 4, lineHeight: 16 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  photoThumbWrap: {
    width: 84,
    height: 84,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  photoThumb: { width: '100%', height: '100%' },
  coverBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTile: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoTileCompact: { minHeight: 56 },
});
