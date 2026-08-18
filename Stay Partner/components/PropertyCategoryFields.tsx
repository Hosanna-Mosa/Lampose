import { StyleSheet, View } from 'react-native';
import { Text, Input, Select, Segmented, Chip, ChipRow, Checkbox, FieldLabel } from '@/components/ui';
import { useColors } from '@/hooks/useColors';

/**
 * The category-specific half of the onboarding form — mirrors
 * `Onboard/src/components/OnboardingForm/CategoryFieldsStep.jsx` field for
 * field, so a listing filled in here and one filled in by a field agent are
 * indistinguishable to the catalogue.
 *
 * `details` is `categoryDetails`: a free-shape object the schema stores as
 * `Mixed`, so nothing here is validated beyond "is it an object" on the way
 * to the server. This component is the only thing keeping the keys and shapes
 * consistent with what `sharing.util.js` and `stayIntent.util.js` expect to
 * read back out of it on the public listing.
 */

type Details = Record<string, any>;

const FOOD_TYPES = ['Both (Veg & Non-Veg)', 'Veg Only', 'Non-Veg Allowed'] as const;
const MEAL_OPTIONS = ['Breakfast', 'Lunch', 'Dinner'] as const;
const MEAL_TIMING_PLACEHOLDERS: Record<string, string> = {
  Breakfast: 'e.g. 7:30 AM - 9:30 AM',
  Lunch: 'e.g. 12:30 PM - 2:30 PM',
  Dinner: 'e.g. 8:00 PM - 10:00 PM',
};
const SHARING_TYPES = ['Single', '2 Sharing', '3 Sharing', '4 Sharing', 'Dorm Sharing'] as const;

const HOSTEL_TYPES = ['Boys Hostel', 'Girls Hostel', 'Co-ed Hostel'] as const;

const RATE_TYPES = ['Daily Rate', 'Monthly Rate', 'Flexible (Hourly/Daily)'] as const;
const BED_TYPES = ['Bunk Bed Pod', 'Single Metal Bed', 'Capsule Luxury Pod'] as const;

const ROOM_TYPES = ['Single Private Room', '1 RK', '1 BHK', '2 BHK', '3 BHK'] as const;
const FURNISHING_OPTIONS = ['Fully Furnished', 'Semi-Furnished', 'Unfurnished'] as const;
const ALLOWED_TENANTS = [
  'Bachelors Male / Female',
  'Bachelors Male Only',
  'Bachelors Female Only',
] as const;

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <Segmented options={['Yes', 'No'] as const} value={value ? 'Yes' : 'No'} onChange={(v) => onChange(v === 'Yes')} />
    </View>
  );
}

function NumberInput({
  label,
  value,
  onChangeNumber,
  placeholder,
}: {
  label: string;
  value: unknown;
  onChangeNumber: (next: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <Input
      label={label}
      value={value === undefined || value === null || value === '' ? '' : String(value)}
      onChangeText={(text) => {
        const digits = text.replace(/[^\d]/g, '');
        onChangeNumber(digits ? Number(digits) : undefined);
      }}
      keyboardType="number-pad"
      placeholder={placeholder}
      containerStyle={styles.field}
    />
  );
}

export function PropertyCategoryFields({
  category,
  details,
  onChange,
}: {
  category: string;
  details: Details;
  onChange: (next: Details) => void;
}) {
  const c = useColors();

  const set = (key: string, value: unknown) => onChange({ ...details, [key]: value });

  const setMapValue = (mapKey: string, itemKey: string, value: unknown) => {
    const map = details[mapKey] && typeof details[mapKey] === 'object' ? details[mapKey] : {};
    onChange({ ...details, [mapKey]: { ...map, [itemKey]: value } });
  };

  const dropMapEntry = (mapKey: string, itemKey: string, base: Details) => {
    const map = base[mapKey];
    if (!map || map[itemKey] === undefined) return base;
    const next = { ...map };
    delete next[itemKey];
    return { ...base, [mapKey]: next };
  };

  const toggleArrayItem = (key: string, item: string, dependentMaps: string[] = []) => {
    const current: string[] = Array.isArray(details[key]) ? details[key] : [];
    const has = current.includes(item);
    let next: Details = { ...details, [key]: has ? current.filter((i) => i !== item) : [...current, item] };
    if (has) dependentMaps.forEach((mapKey) => { next = dropMapEntry(mapKey, item, next); });
    onChange(next);
  };

  if (!category) return null;

  if (category === 'PG') {
    const selectedMeals: string[] = Array.isArray(details.mealsProvided) ? details.mealsProvided : [];
    const sharingTypes: string[] = Array.isArray(details.sharingTypes) ? details.sharingTypes : [];

    return (
      <View>
        <YesNo label="Food provided?" value={Boolean(details.foodIncluded)} onChange={(v) => set('foodIncluded', v)} />

        {details.foodIncluded ? (
          <Select
            label="Food type"
            options={FOOD_TYPES}
            value={(details.foodType as (typeof FOOD_TYPES)[number]) ?? null}
            onChange={(v) => set('foodType', v)}
          />
        ) : null}

        {details.foodIncluded ? (
          <View style={styles.field}>
            <FieldLabel optional>Meals provided</FieldLabel>
            <ChipRow>
              {MEAL_OPTIONS.map((meal) => (
                <Chip
                  key={meal}
                  label={meal}
                  selected={selectedMeals.includes(meal)}
                  onPress={() => toggleArrayItem('mealsProvided', meal, ['mealTimings'])}
                />
              ))}
            </ChipRow>

            {selectedMeals.map((meal) => (
              <Input
                key={meal}
                label={`${meal} timing`}
                value={(details.mealTimings || {})[meal] ?? ''}
                onChangeText={(text) => setMapValue('mealTimings', meal, text)}
                placeholder={MEAL_TIMING_PLACEHOLDERS[meal]}
                containerStyle={styles.subField}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.field}>
          <FieldLabel optional>Sharing options available</FieldLabel>
          <ChipRow>
            {SHARING_TYPES.map((type) => (
              <Chip
                key={type}
                label={type}
                selected={sharingTypes.includes(type)}
                onPress={() => toggleArrayItem('sharingTypes', type, ['sharingPrices', 'sharingAC', 'sharingAcPrices'])}
              />
            ))}
          </ChipRow>

          {sharingTypes.map((type) => {
            const hasAC = Boolean(details.sharingAC?.[type]);
            return (
              <View key={type} style={[styles.subCard, { borderColor: c.borderCard, backgroundColor: c.surfaceSunken }]}>
                <Text variant="badge" color="textSecondary" style={styles.subCardTitle}>
                  {type}
                </Text>
                <NumberInput
                  label={`${type} rent (₹)`}
                  value={details.sharingPrices?.[type]}
                  onChangeNumber={(n) => setMapValue('sharingPrices', type, n)}
                  placeholder="e.g. 6000"
                />
                <Checkbox
                  label={`AC available for ${type}`}
                  checked={hasAC}
                  onChange={(checked) => {
                    let next: Details = { ...details, sharingAC: { ...(details.sharingAC || {}), [type]: checked } };
                    if (!checked) next = dropMapEntry('sharingAcPrices', type, next);
                    onChange(next);
                  }}
                />
                {hasAC ? (
                  <NumberInput
                    label={`${type} AC rent (₹)`}
                    value={details.sharingAcPrices?.[type]}
                    onChangeNumber={(n) => setMapValue('sharingAcPrices', type, n)}
                    placeholder="e.g. 8000"
                  />
                ) : null}
              </View>
            );
          })}
        </View>

        <Input
          label="Curfew / gate timing"
          optional
          value={details.curfewTime ?? ''}
          onChangeText={(text) => set('curfewTime', text)}
          placeholder="e.g. 10:30 PM or No Curfew"
          containerStyle={styles.field}
        />
      </View>
    );
  }

  if (category === 'Hostel') {
    return (
      <View>
        <Select
          label="Hostel type"
          options={HOSTEL_TYPES}
          value={(details.hostelType as (typeof HOSTEL_TYPES)[number]) ?? null}
          onChange={(v) => set('hostelType', v)}
        />
        <Input
          label="Warden contact number"
          optional
          value={details.wardenContact ?? ''}
          onChangeText={(text) => set('wardenContact', text)}
          placeholder="e.g. +91 98765 00000"
          keyboardType="phone-pad"
          containerStyle={styles.field}
        />
        <YesNo
          label="In-house mess / canteen?"
          value={details.canteenFacility !== false}
          onChange={(v) => set('canteenFacility', v)}
        />
        <YesNo
          label="24/7 security CCTV & warden?"
          value={details.securityCCTV !== false}
          onChange={(v) => set('securityCCTV', v)}
        />
      </View>
    );
  }

  if (category === 'Dormitory') {
    return (
      <View>
        <NumberInput
          label="Total beds available"
          value={details.totalBeds}
          onChangeNumber={(n) => set('totalBeds', n)}
          placeholder="e.g. 24"
        />
        <Select
          label="Pricing structure"
          options={RATE_TYPES}
          value={(details.rateType as (typeof RATE_TYPES)[number]) ?? null}
          onChange={(v) => set('rateType', v)}
        />
        <Select
          label="Bed format"
          options={BED_TYPES}
          value={(details.bedType as (typeof BED_TYPES)[number]) ?? null}
          onChange={(v) => set('bedType', v)}
        />
        <NumberInput
          label="Shared washrooms count"
          value={details.washroomsCount}
          onChangeNumber={(n) => set('washroomsCount', n)}
          placeholder="e.g. 6"
        />
      </View>
    );
  }

  if (category === 'Bachelor Room') {
    return (
      <View>
        <Select
          label="Room / flat layout"
          options={ROOM_TYPES}
          value={(details.roomType as (typeof ROOM_TYPES)[number]) ?? null}
          onChange={(v) => set('roomType', v)}
        />
        <Select
          label="Furnishing status"
          options={FURNISHING_OPTIONS}
          value={(details.furnishing as (typeof FURNISHING_OPTIONS)[number]) ?? null}
          onChange={(v) => set('furnishing', v)}
        />
        <Select
          label="Allowed tenants"
          options={ALLOWED_TENANTS}
          value={(details.allowedTenants as (typeof ALLOWED_TENANTS)[number]) ?? null}
          onChange={(v) => set('allowedTenants', v)}
        />
        <YesNo
          label="Kitchen / cooking provision?"
          value={details.kitchenAvailable !== false}
          onChange={(v) => set('kitchenAvailable', v)}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  subField: { marginTop: 10 },
  subCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  subCardTitle: { marginBottom: 2 },
});
