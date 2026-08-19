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
/* The physical format of the bed — a different question from how many share
   the room, which is BED_OCCUPANCIES below. */
const BED_TYPES = ['Bunk Bed Pod', 'Single Metal Bed', 'Capsule Luxury Pod'] as const;

/* How many share one hotel or dormitory room. A hotel says "Double" where a
   PG says "2 Sharing" — the same number, and not the same word to anybody
   booking one. Each carries its own rate, and its own AC rate where AC is
   offered, because a hostel commonly runs AC and non-AC dorms side by side. */
const BED_OCCUPANCIES = ['Single', 'Double', '3 Sharing', '4 Sharing'] as const;

/* The three ways a bed is sold, priced per bed type — the same grid the
   onboarding form offers. Nightly writes to `sharingPrices`/`sharingAcPrices`
   because those are what the occupancy reader and the bed inventory consume;
   the other two are additions and optional. */
const RATE_STRUCTURES = [
  { id: 'nightly', label: 'per night', base: 'sharingPrices', ac: 'sharingAcPrices', hint: 'e.g. 450' },
  { id: 'monthly', label: 'per month', base: 'monthlyPrices', ac: 'monthlyAcPrices', hint: 'e.g. 9000' },
  { id: 'flexible', label: 'flexible / hourly', base: 'flexiblePrices', ac: 'flexibleAcPrices', hint: 'e.g. 150' },
] as const;

const ROOM_TYPES = ['Single Private Room', '1 RK', '1 BHK', '2 BHK', '3 BHK'] as const;
const FURNISHING_OPTIONS = ['Fully Furnished', 'Semi-Furnished', 'Unfurnished'] as const;

/*
 * What "furnished" actually means, per level — the same two lists the
 * onboarding form offers.
 *
 * "Semi-Furnished" is the vaguest word on the form: to one owner it is a bed
 * and a wardrobe, to another everything but the sofa. The level is a heading
 * and this list is the promise. Neither list is a subset of the other — semi
 * carries fittings a full let takes for granted.
 *
 * Unfurnished has no list. That is the point of it.
 */
const FURNISHING_ITEMS: Record<string, readonly string[]> = {
  'Fully Furnished': [
    'Bed', 'Mattress', 'Sofa', 'Wardrobe', 'Table', 'Chairs', 'TV',
    'Refrigerator', 'Washing Machine', 'AC', 'Fan', 'Geyser', 'Water Purifier',
    'Kitchen Setup', 'Gas Stove', 'Dining Table', 'Curtains', 'Wi-Fi',
    'Balcony Furniture',
  ],
  'Semi-Furnished': [
    'Wardrobe', 'Bed', 'Fan', 'Light Fixtures', 'Geyser', 'AC',
    'Kitchen Cabinets', 'Modular Kitchen', 'Exhaust Fan', 'Curtains',
    'Dining/Counter Area', 'Water Purifier',
  ],
};
/*
 * Who may take the property, per category.
 *
 * A bachelor let is single-gender by definition — that is what the category
 * means — so it offers only the two. A co-live house is shared and a mixed
 * house is a normal thing to run, so it keeps all three. Same split as the
 * onboarding form.
 */
const ALLOWED_TENANTS = [
  'Bachelors Male / Female',
  'Bachelors Male Only',
  'Bachelors Female Only',
] as const;

const TENANTS_BY_CATEGORY: Record<string, readonly string[]> = {
  BACHELOR: ['Bachelors Male Only', 'Bachelors Female Only'],
  COLIVE: ALLOWED_TENANTS,
};

const TENANT_LABEL: Record<string, string> = {
  'Bachelors Male / Female': 'Male / Female (mixed)',
  'Bachelors Male Only': 'Male Only',
  'Bachelors Female Only': 'Female Only',
};

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

  const pgFields = () => {
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
  };

  const hostelFields = () => {
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
  };

  /*
   * PG and hostel are one category, and this screen shows the union of what
   * the two used to ask — meals and sharing from the PG form, warden and
   * canteen from the hostel one. Composed rather than rendered in sequence
   * because each half returns its own <View>.
   *
   * An owner fills in whichever apply. A PG with no warden leaves that blank,
   * and nothing below requires it.
   */
  if (category === 'PG_HOSTEL') {
    return (
      <View>
        {pgFields()}
        {hostelFields()}
      </View>
    );
  }

  if (category === 'HOTEL') {
    const bedTypes: string[] = Array.isArray(details.bedTypes) ? (details.bedTypes as string[]) : [];

    return (
      <View>
        <View style={styles.field}>
          <FieldLabel>Bed types available</FieldLabel>
          <ChipRow>
            {BED_OCCUPANCIES.map((bed) => (
              <Chip
                key={bed}
                label={bed}
                selected={bedTypes.includes(bed)}
                onPress={() => toggleArrayItem('bedTypes', bed, ['sharingPrices', 'sharingAC', 'sharingAcPrices'])}
              />
            ))}
          </ChipRow>

          {bedTypes.map((bed) => {
            const hasAC = Boolean(details.sharingAC?.[bed]);
            return (
              <View key={bed} style={[styles.subCard, { borderColor: c.borderCard, backgroundColor: c.surfaceSunken }]}>
                <Text variant="badge" color="textSecondary" style={styles.subCardTitle}>
                  {bed}
                </Text>
                <NumberInput
                  label={`Total ${bed} beds available`}
                  value={details.sharingBeds?.[bed]}
                  onChangeNumber={(n) => setMapValue('sharingBeds', bed, n)}
                  placeholder="e.g. 12"
                />
                <Checkbox
                  label={`AC available for ${bed}`}
                  checked={hasAC}
                  onChange={(checked) => {
                    let next: Details = { ...details, sharingAC: { ...(details.sharingAC || {}), [bed]: checked } };
                    /* An AC rate for a bed with no AC would resurface as a
                       price on the site, so all three go with the tick. */
                    if (!checked) {
                      RATE_STRUCTURES.forEach((rate) => { next = dropMapEntry(rate.ac, bed, next); });
                    }
                    onChange(next);
                  }}
                />
                {RATE_STRUCTURES.map((rate) => (
                  <View key={rate.id}>
                    <NumberInput
                      label={`${bed} ${rate.label} (₹)`}
                      value={(details[rate.base] as Record<string, number> | undefined)?.[bed]}
                      onChangeNumber={(n) => setMapValue(rate.base, bed, n)}
                      placeholder={rate.hint}
                    />
                    {hasAC ? (
                      <NumberInput
                        label={`${bed} ${rate.label} with AC (₹)`}
                        value={(details[rate.ac] as Record<string, number> | undefined)?.[bed]}
                        onChangeNumber={(n) => setMapValue(rate.ac, bed, n)}
                        placeholder={rate.hint}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            );
          })}
        </View>

        {/* Beds, rates, bed format and washroom count all used to sit here.
            The first two are per bed type now — a building renting four kinds
            of bed cannot say how many of each with one number, and one rate
            structure for the whole property made the other two unsellable.
            The last two are gone outright: neither is a thing a guest chooses
            on, and neither was shown anywhere. */}
        {/* No check-in or check-out. Those are the guest's dates, chosen when
            booking, not a fact an owner records once about the building —
            asking here produced a policy time that read like an availability
            window and was neither. */}
      </View>
    );
  }

  /* Co-live is let as a whole property like a bachelor flat and records
     the same facts, so it shares this block. */
  if (category === 'BACHELOR' || category === 'COLIVE') {
    /* Layouts are a multi-select with a rent against each, matching what the
       onboarding form writes. A row created before that carries one layout as
       a string, and is shown as that single chip so editing is not a reset. */
    const roomTypes: string[] = Array.isArray(details.roomTypes)
      ? (details.roomTypes as string[])
      : (typeof details.roomType === 'string' && details.roomType ? [details.roomType] : []);

    /* A value saved before the list was narrowed stays selectable, so editing
       an old listing cannot silently change who it is let to. */
    /* Custom items are added on the onboarding form; they are shown and
       untickable here, but this screen does not offer to invent new ones. */
    const furnishingCustom: string[] = Array.isArray(details.customFurnishingItems)
      ? (details.customFurnishingItems as string[])
      : [];
    const baseTenants = TENANTS_BY_CATEGORY[category] ?? ALLOWED_TENANTS;

    /* A value saved before the list was narrowed stays selectable, so editing
       an old listing cannot silently change who it is let to. */
    const tenantOptionsFor = (layout: string): readonly string[] => {
      const saved = String((details.allowedTenantsByLayout || {})[layout] ?? '');
      return saved && !baseTenants.includes(saved) ? [...baseTenants, saved] : baseTenants;
    };

    return (
      <View>
        <View style={styles.field}>
          <FieldLabel>Room / flat layouts available</FieldLabel>
          <ChipRow>
            {ROOM_TYPES.map((type) => (
              <Chip
                key={type}
                label={type}
                selected={roomTypes.includes(type)}
                onPress={() => {
                  const has = roomTypes.includes(type);
                  const nextTypes = has ? roomTypes.filter((t) => t !== type) : [...roomTypes, type];
                  let next: Details = { ...details, roomTypes: nextTypes, roomType: nextTypes[0] || '' };
                  /* A rent for a layout nobody offers would resurface as a
                     price on the site, so it goes with the layout. */
                  if (has) next = dropMapEntry('sharingPrices', type, next);
                  onChange(next);
                }}
              />
            ))}
          </ChipRow>

          {roomTypes.map((type) => {
            const level = String((details.furnishingByLayout || {})[type] ?? 'Semi-Furnished');
            const base = FURNISHING_ITEMS[level] ?? [];
            const ticked: string[] = (details.furnishingItemsByLayout || {})[type] ?? [];
            const options = [...base, ...furnishingCustom.filter((x) => !base.includes(x))];

            return (
              <View key={type} style={[styles.subCard, { borderColor: c.borderCard, backgroundColor: c.surfaceSunken }]}>
                <Text variant="badge" color="textSecondary" style={styles.subCardTitle}>
                  {type}
                </Text>
                <NumberInput
                  label={`${type} rent (₹)`}
                  value={details.sharingPrices?.[type]}
                  onChangeNumber={(n) => setMapValue('sharingPrices', type, n)}
                  placeholder="e.g. 12000"
                />
                <NumberInput
                  label={`How many ${type}s`}
                  value={details.sharingRooms?.[type]}
                  onChangeNumber={(n) => {
                    /* One flat is one lettable unit, so beds equal the count —
                       and beds are what the request flow decrements. */
                    onChange({
                      ...details,
                      sharingRooms: { ...(details.sharingRooms || {}), [type]: n },
                      sharingBeds: { ...(details.sharingBeds || {}), [type]: n },
                    });
                  }}
                  placeholder="e.g. 3"
                />
                <Select
                  label={`${type} furnishing`}
                  options={FURNISHING_OPTIONS}
                  value={level as (typeof FURNISHING_OPTIONS)[number]}
                  onChange={(next) => {
                    /* Ticks that answered the previous level's list are
                       dropped; custom items were typed for this property, not
                       for a level, so they stay. */
                    const nextBase = FURNISHING_ITEMS[next] ?? [];
                    onChange({
                      ...details,
                      furnishingByLayout: { ...(details.furnishingByLayout || {}), [type]: next },
                      furnishingItemsByLayout: {
                        ...(details.furnishingItemsByLayout || {}),
                        [type]: nextBase.length
                          ? ticked.filter((i) => nextBase.includes(i) || furnishingCustom.includes(i))
                          : [],
                      },
                    });
                  }}
                />
                <Select
                  label={`${type} allowed tenants`}
                  options={tenantOptionsFor(type)}
                  format={(t) => TENANT_LABEL[t] ?? t}
                  value={String((details.allowedTenantsByLayout || {})[type] ?? baseTenants[0])}
                  onChange={(next) => onChange({
                    ...details,
                    allowedTenantsByLayout: { ...(details.allowedTenantsByLayout || {}), [type]: next },
                  })}
                />
                <YesNo
                  label={`${type} kitchen / cooking provision?`}
                  value={(details.kitchenByLayout || {})[type] !== false}
                  onChange={(v) => onChange({
                    ...details,
                    kitchenByLayout: { ...(details.kitchenByLayout || {}), [type]: v },
                  })}
                />
                {options.length ? (
                  <View style={styles.subField}>
                    <FieldLabel optional>Key amenities included</FieldLabel>
                    <ChipRow>
                      {options.map((item) => (
                        <Chip
                          key={item}
                          label={item}
                          selected={ticked.includes(item)}
                          onPress={() => onChange({
                            ...details,
                            furnishingItemsByLayout: {
                              ...(details.furnishingItemsByLayout || {}),
                              [type]: ticked.includes(item)
                                ? ticked.filter((i) => i !== item)
                                : [...ticked, item],
                            },
                          })}
                        />
                      ))}
                    </ChipRow>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Furnishing is per layout now, inside each card above — a house
            commonly lets a semi-furnished 1 BHK and a fully-furnished 2 BHK,
            and one status for the whole property could only describe one. */}
        {/* Allowed tenants and kitchen are per layout now, inside each card
            above — a building commonly lets its 1 RKs to men and its 2 BHKs to
            women, and puts a kitchen in some units and not others. */}
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
