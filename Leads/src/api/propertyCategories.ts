/**
 * The property categories, as the server stores them.
 *
 * The database holds CODES (PG_HOSTEL, BACHELOR, HOTEL, COLIVE, COMMERCIAL),
 * defined in Backend/src/shared/constants/categories.js. This panel used to
 * filter and count by the old display strings ('PG', 'Hostel', 'Dormitory',
 * 'Bachelor Room'), so every badge read zero for anything written since the
 * switch. The codes and labels below mirror the backend's `CATEGORIES` and
 * `CATEGORY_LABEL`; the label is presentation, the code is not ours to change.
 *
 * Older rows were never migrated, so a stored value can still be a legacy
 * spelling. `normaliseCategory` maps those onto a code the same way the
 * server's `normaliseCategory` does (its `LEGACY_CATEGORY` table).
 */
export type PropertyCategoryCode = 'PG_HOSTEL' | 'BACHELOR' | 'HOTEL' | 'COLIVE' | 'COMMERCIAL';

export interface PropertyCategoryMeta {
  value: PropertyCategoryCode;
  label: string;
  /** Tailwind classes for the card badge. */
  chip: string;
}

export const PROPERTY_CATEGORIES: readonly PropertyCategoryMeta[] = [
  { value: 'PG_HOSTEL', label: 'PG / Hostel', chip: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'BACHELOR', label: 'Bachelor', chip: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'HOTEL', label: 'Hotels', chip: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'COLIVE', label: 'House / Co-live', chip: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { value: 'COMMERCIAL', label: 'Shop / Commercial', chip: 'bg-rose-100 text-rose-700 border-rose-200' },
];

const LEGACY_CATEGORY: Record<string, PropertyCategoryCode> = {
  pg: 'PG_HOSTEL',
  hostel: 'PG_HOSTEL',
  'pg/hostel': 'PG_HOSTEL',
  'pg / hostel': 'PG_HOSTEL',
  pg_hostel: 'PG_HOSTEL',

  'bachelor room': 'BACHELOR',
  'bachelor rooms': 'BACHELOR',
  bachelor: 'BACHELOR',

  dormitory: 'HOTEL',
  hotel: 'HOTEL',
  hotels: 'HOTEL',

  colive: 'COLIVE',
  'co-live': 'COLIVE',
  'house/co-live': 'COLIVE',
  'house / co-live': 'COLIVE',

  commercial: 'COMMERCIAL',
  shop: 'COMMERCIAL',
  'shop/commercial': 'COMMERCIAL',
  'shop / commercial': 'COMMERCIAL',
  'commercial space': 'COMMERCIAL',
};

/** The code for any spelling that has ever named a category, or null. */
export const normaliseCategory = (value?: string | null): PropertyCategoryCode | null => {
  const key = String(value ?? '').trim().toLowerCase();
  if (!key) return null;
  return LEGACY_CATEGORY[key] || null;
};

/** What a person reads for a stored value. Unknown values are shown as stored. */
export const categoryLabel = (value?: string | null): string => {
  const code = normaliseCategory(value);
  const meta = code ? PROPERTY_CATEGORIES.find((c) => c.value === code) : undefined;
  return meta ? meta.label : (value || 'Uncategorised');
};

/** Badge classes for a stored value; neutral for an unknown one. */
export const categoryChip = (value?: string | null): string => {
  const code = normaliseCategory(value);
  const meta = code ? PROPERTY_CATEGORIES.find((c) => c.value === code) : undefined;
  return meta ? meta.chip : 'bg-slate-100 text-slate-600 border-slate-300';
};
