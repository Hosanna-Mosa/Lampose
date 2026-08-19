import React, { useState } from 'react';
import { Utensils, ShieldCheck, Bed, Key, Check, Snowflake, Plus, X, CloudUpload } from 'lucide-react';
import FieldError, { errorBorder } from './FieldError.jsx';
import {
  sharingPriceKey, sharingAcPriceKey, furnishingKey, roomCountKey,
} from '../../services/validation.js';

const MEAL_OPTIONS = ['Breakfast', 'Lunch', 'Dinner'];

/**
 * How many people the label says share one room.
 *
 * Mirrors `occupancyOf` in the backend's sharing.util.js, and must keep
 * mirroring it: the agent enters ROOMS here and the beds are multiplied out,
 * so the two sides disagreeing would put a different capacity in the database
 * than the one on this screen.
 *
 * Null where the label does not say — "Dorm Sharing", "1 BHK Independent".
 * Then the form asks for beds directly instead of multiplying.
 */
const occupancyOf = (label) => {
  const text = String(label || '').toLowerCase();
  if (/\bsingle\b/.test(text)) return 1;
  if (/\bdouble\b/.test(text)) return 2;
  if (/\btriple\b/.test(text)) return 3;
  if (/\bquad(ruple)?\b/.test(text)) return 4;
  const digits = text.match(/(\d+)\s*(sharing|share|bed|seater)/);
  if (digits) {
    const n = Number(digits[1]);
    return Number.isFinite(n) && n > 0 && n <= 50 ? n : null;
  }
  return null;
};

/* The occupancies most properties are laid out in. Anything else is added
   through "Custom" and recorded in `customSharingTypes` — see SharingOptions
   at the bottom of this file. */
const BASE_SHARING_TYPES = ['Single', '2 Sharing', '3 Sharing', '4 Sharing'];

/*
 * How many share one hotel or dormitory room.
 *
 * A separate list from BASE_SHARING_TYPES because a hotel says "Double" where
 * a PG says "2 Sharing" — the same number, and not the same word to anybody
 * booking one. The labels still parse through `occupancyOf` server-side, so
 * "Double" is read as two beds without anything having to be taught the
 * vocabulary.
 *
 * Distinct from `bedType`, which is the physical format of the bed — a bunk,
 * a metal frame, a capsule pod. That question is still asked separately.
 */
const BED_TYPES = ['Single', 'Double', '3 Sharing', '4 Sharing'];

/*
 * What counts as credible evidence that this hotel is this hotel.
 *
 * Any one of them will do — the point is that SOMETHING official ties the
 * business to the premises, and which document an owner happens to hold
 * varies by state, by age of the building and by whether they own or lease.
 * Demanding a specific one would turn a legitimate hotel away.
 */
const PREMISES_DOC_TYPES = [
  'Trade / Shop & Establishment Licence',
  'GST Registration Certificate',
  'Property Tax Receipt',
  'Electricity Bill (in the business name)',
  'Registered Lease or Rent Agreement',
  'Fire Safety NOC',
  'Municipal / Panchayat Permission',
];

/*
 * The three ways a bed is sold, priced per bed type.
 *
 * A hostel does not price a building, it prices a bed — and the same bed goes
 * nightly to a traveller, monthly to a student and hourly to somebody between
 * trains. The form used to make an agent pick ONE structure for the whole
 * property, so the other two were unsellable through the site even when the
 * hostel offered them.
 *
 * `nightly` maps to `sharingPrices` and `sharingAcPrices` rather than to keys
 * of its own, because those are what the occupancy reader, the listing
 * chooser and the bed inventory already consume — and nightly is the rate a
 * hotel leads with. The other two are additions, and optional.
 */
const RATE_STRUCTURES = [
  { id: 'nightly', label: 'Per night', base: 'sharingPrices', ac: 'sharingAcPrices', required: true, hint: 'e.g. 450' },
  { id: 'monthly', label: 'Per month', base: 'monthlyPrices', ac: 'monthlyAcPrices', required: false, hint: 'e.g. 9000' },
  { id: 'flexible', label: 'Flexible / hourly', base: 'flexiblePrices', ac: 'flexibleAcPrices', required: false, hint: 'e.g. 150' },
];

/*
 * Room / flat layouts for the whole-property categories.
 *
 * A property is rarely one layout. A building let to bachelors commonly has
 * 1 RKs on one floor and 2 BHKs on another at a different rent, and the form
 * used to make an agent pick one and lose the rest — so this is a multi-select
 * with a rent against each, the same shape the sharing options use.
 */
const ROOM_LAYOUTS = [
  { id: 'Single Private Room', label: 'Single Private Room' },
  { id: '1 RK', label: '1 RK (Room Kitchen)' },
  { id: '1 BHK', label: '1 BHK Apartment' },
  { id: '2 BHK', label: '2 BHK Apartment' },
  { id: '3 BHK', label: '3 BHK Apartment' },
];

/*
 * Who may take the property, per category.
 *
 * A bachelor let is by definition single-gender — that is what the category
 * means — so it offers only the two. A co-live house is shared, and a mixed
 * house is a normal thing to run, so it keeps all three.
 */
/*
 * What "furnished" actually means, per level.
 *
 * "Semi-Furnished" is the vaguest word on the form — to one owner it is a bed
 * and a wardrobe, to another it is everything but the sofa. A student cannot
 * tell those apart from the word, and turns up to find no geyser. So the level
 * is a heading and the list underneath is the promise.
 *
 * Two lists rather than one, because the two levels are asked differently: a
 * fully-furnished let is a whole household to tick off, and a semi-furnished
 * one is the shorter list of what the owner is ADDING to bare walls. Neither
 * is a subset of the other — semi carries fittings a full let takes for
 * granted (light fixtures, kitchen cabinets, an exhaust fan).
 *
 * Unfurnished has no list. That is the point of it.
 */
const FURNISHING_ITEMS = {
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

const TENANT_OPTIONS = {
  BACHELOR: [
    { id: 'Bachelors Male Only', label: 'Bachelors Male Only' },
    { id: 'Bachelors Female Only', label: 'Bachelors Female Only' },
  ],
  COLIVE: [
    { id: 'Bachelors Male / Female', label: 'Male / Female (mixed)' },
    { id: 'Bachelors Male Only', label: 'Male Only' },
    { id: 'Bachelors Female Only', label: 'Female Only' },
  ],
};

/** People per room → the label the rest of the platform keys prices by.
 *  1 resolves onto "Single" rather than minting "1 Sharing": the public site,
 *  the visit-request validator and the admin console all already know the one
 *  word for it, and a second name for the same thing would not match. */
const sharingLabelFor = (count) => (count === 1 ? 'Single' : `${count} Sharing`);

const MEAL_TIMING_PLACEHOLDERS = {
  Breakfast: 'e.g. 7:30 AM - 9:30 AM',
  Lunch: 'e.g. 12:30 PM - 2:30 PM',
  Dinner: 'e.g. 8:00 PM - 10:00 PM'
};

// Keyed maps that hang off a checkbox list: deselecting an option must take its
// entries with it, or a stale price would keep counting toward the headline rent.
const DEPENDENT_MAPS = {
  sharingTypes: ['sharingPrices', 'sharingAC', 'sharingAcPrices', 'sharingRooms', 'sharingBeds'],
  mealsProvided: ['mealTimings']
};

/*
 * Codes to words, and codes to the badge colour they already had.
 *
 * PG_HOSTEL keeps the PG badge because that is the great majority of what it
 * covers, and a hostel onboarded under it is still, visually, the same kind
 * of thing. See Backend/src/shared/constants/categories.js for the codes.
 */
const CATEGORY_LABEL = {
  PG_HOSTEL: 'PG / Hostel',
  BACHELOR: 'Bachelor',
  HOTEL: 'Hotels',
  COLIVE: 'House / Co-live',
};

const CATEGORY_BADGE = {
  PG_HOSTEL: 'badge-pg',
  BACHELOR: 'badge-bachelor',
  HOTEL: 'badge-dormitory',
  COLIVE: 'badge-bachelor',
};

export default function CategoryFieldsStep({ category, details = {}, onChangeDetails, errors = {} }) {
  if (!category) return null;

  const handleToggle = (field, value) => {
    onChangeDetails(field, value);
  };

  const handleCheckboxArray = (field, item) => {
    const currentArray = Array.isArray(details[field]) ? details[field] : [];
    let updated;
    if (currentArray.includes(item)) {
      updated = currentArray.filter(i => i !== item);
      (DEPENDENT_MAPS[field] || []).forEach((mapField) => {
        if (details[mapField] && details[mapField][item] !== undefined) {
          const trimmed = { ...details[mapField] };
          delete trimmed[item];
          onChangeDetails(mapField, trimmed);
        }
      });
    } else {
      updated = [...currentArray, item];
    }
    onChangeDetails(field, updated);
  };

  /** Write one key of a `{ [option]: value }` map without disturbing the rest. */
  const setMapValue = (mapField, key, value) => {
    onChangeDetails(mapField, { ...(details[mapField] || {}), [key]: value });
  };

  const selectedMeals = Array.isArray(details.mealsProvided) ? details.mealsProvided : [];

  return (
    <div className="animate-fade-in" style={{
      marginBottom: '28px',
      padding: '24px',
      background: '#f8faf8',
      borderRadius: 'var(--radius-md)',
      border: '1px solid #e2e8f0'
    }}>
      <h3 style={{ fontSize: '1.2rem', color: '#181e1b', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className={`badge ${CATEGORY_BADGE[category] || 'badge-bachelor'}`}>
          {CATEGORY_LABEL[category] || category}
        </span>
        <span>Category Specific Details ({CATEGORY_LABEL[category] || category})</span>
      </h3>

      {/*
        * ============ PG / HOSTEL ============
        *
        * Two blocks, one category. PG and hostel merged, and the merged
        * form asks the union of what the two asked — so a former hostel
        * keeps its warden contact and a former PG keeps its meal timings,
        * and an agent fills in whichever apply to the building they are
        * standing in. Only this first block carries the sharing picker;
        * the second never had one.
        */}
      {category === 'PG_HOSTEL' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          {/* Food Included */}
          <div className="form-group">
            <label className="form-label">Food Provided? *</label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                className={`btn ${details.foodIncluded ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, padding: '10px' }}
                onClick={() => handleToggle('foodIncluded', true)}
              >
                Yes (Food Included)
              </button>
              <button
                type="button"
                className={`btn ${!details.foodIncluded ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, padding: '10px' }}
                onClick={() => handleToggle('foodIncluded', false)}
              >
                No Food
              </button>
            </div>
          </div>

          {/* Food Type */}
          {details.foodIncluded && (
            <div className="form-group">
              <label className="form-label">Food Type</label>
              <select
                className="form-select"
                value={details.foodType || 'Both (Veg & Non-Veg)'}
                onChange={(e) => onChangeDetails('foodType', e.target.value)}
              >
                <option value="Both (Veg & Non-Veg)">Both (Veg & Non-Veg)</option>
                <option value="Veg Only">Veg Only</option>
                <option value="Non-Veg Allowed">Non-Veg Allowed</option>
              </select>
            </div>
          )}

          {/* Meals Served — which of the three, and when */}
          {details.foodIncluded && (
            <div id="mealsProvided" className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Meals Provided *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {MEAL_OPTIONS.map((meal) => {
                  const isSelected = selectedMeals.includes(meal);
                  return (
                    <div
                      key={meal}
                      onClick={() => handleCheckboxArray('mealsProvided', meal)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        background: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        border: isSelected ? '1px solid #10b981' : '1px solid var(--border-glass)',
                        color: isSelected ? '#34d399' : 'var(--text-sub)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {isSelected ? <Check size={14} /> : <Utensils size={14} />}
                      <span>{meal}</span>
                    </div>
                  );
                })}
              </div>
              <FieldError message={errors['categoryDetails.mealsProvided']} />

              {/* Serving time for each meal that is actually served */}
              {selectedMeals.length > 0 && (
                <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(0, 0, 0, 0.02)', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                  <label className="form-label" style={{ fontSize: '0.85rem', color: '#181e1b', fontWeight: 700, marginBottom: '10px' }}>
                    Serving Timings for Selected Meals:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    {MEAL_OPTIONS.filter((meal) => selectedMeals.includes(meal)).map((meal) => (
                      <div key={meal} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>{meal} Timing</span>
                        <input
                          type="text"
                          placeholder={MEAL_TIMING_PLACEHOLDERS[meal]}
                          value={(details.mealTimings || {})[meal] || ''}
                          onChange={(e) => setMapValue('mealTimings', meal, e.target.value)}
                          className="form-input"
                          style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sharing Types */}
          <SharingOptions
            details={details}
            onChangeDetails={onChangeDetails}
            onToggleType={(type) => handleCheckboxArray('sharingTypes', type)}
            setMapValue={setMapValue}
            errors={errors}
          />

          {/* AC is captured per sharing option above, with its own rate, so there
              is no property-wide AC question here. */}

          {/* Curfew Time */}
          <div className="form-group">
            <label className="form-label">Curfew / Gate Timing</label>
            <input
              type="text"
              placeholder="e.g. 10:30 PM or No Curfew"
              value={details.curfewTime || ''}
              onChange={(e) => onChangeDetails('curfewTime', e.target.value)}
              className="form-input"
            />
          </div>
        </div>
      )}

      {/* ==================== HOSTEL FORM ==================== */}
      {category === 'PG_HOSTEL' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          {/* Hostel Type */}
          <div className="form-group">
            <label className="form-label">Hostel Type *</label>
            <select
              className="form-select"
              value={details.hostelType || 'Boys Hostel'}
              onChange={(e) => onChangeDetails('hostelType', e.target.value)}
            >
              <option value="Boys Hostel">Boys Hostel</option>
              <option value="Girls Hostel">Girls Hostel</option>
              <option value="Co-ed Hostel">Co-ed Hostel</option>
            </select>
          </div>

          {/* Warden Contact */}
          <div className="form-group">
            <label className="form-label">Warden Contact Number</label>
            <input
              type="tel"
              placeholder="e.g. +91 98765 00000"
              value={details.wardenContact || ''}
              id="wardenContact"
              onChange={(e) => onChangeDetails('wardenContact', e.target.value)}
              className="form-input"
            />
          </div>

          {/* Canteen Facility */}
          <div className="form-group">
            <label className="form-label">In-house Mess / Canteen?</label>
            <select
              className="form-select"
              value={details.canteenFacility !== undefined ? (details.canteenFacility ? 'Yes' : 'No') : 'Yes'}
              onChange={(e) => onChangeDetails('canteenFacility', e.target.value === 'Yes')}
            >
              <option value="Yes">Yes (Mess / Canteen Available)</option>
              <option value="No">No Canteen</option>
            </select>
          </div>

          {/* Security & Study Room */}
          <div className="form-group">
            <label className="form-label">24/7 Security CCTV & Warden?</label>
            <select
              className="form-select"
              value={details.securityCCTV !== undefined ? (details.securityCCTV ? 'Yes' : 'No') : 'Yes'}
              onChange={(e) => onChangeDetails('securityCCTV', e.target.value === 'Yes')}
            >
              <option value="Yes">Yes (CCTV & Security Guard)</option>
              <option value="No">Basic Security</option>
            </select>
          </div>
        </div>
      )}

      {/* ==================== DORMITORY FORM ==================== */}
      {category === 'HOTEL' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          <BedTypes details={details} onChangeDetails={onChangeDetails} errors={errors} />
          <HotelDocuments details={details} onChangeDetails={onChangeDetails} errors={errors} />

          {/* Total Beds */}
          {/*
            * Everything that used to sit here is now per bed type, inside the
            * cards above.
            *
            * Total Beds Available was one number for a building that rents
            * four different kinds of bed, so it could not say how many of each
            * — and the bed count is what the request flow decrements. Pricing
            * Structure made an agent choose ONE of nightly, monthly and
            * flexible for the whole property, which made the other two
            * unsellable through the site even when the hostel offered them.
            *
            * Bed Format and Shared Washrooms Count are gone outright: a
            * bunk-or-pod answer for the whole building and a single washroom
            * tally are not things a guest chooses on, and neither was shown
            * anywhere. Both are still read from older rows.
            *
            * `totalBeds` and `rateType` are still written, derived in App.jsx,
            * so the listing formatter and the admin console keep working.
            */}
        </div>
      )}

      {/* ==================== BACHELOR ROOM FORM ==================== */}
      {/* Co-live is let as a whole property like a bachelor flat, and
          records the same facts — so it shares this block rather than
          duplicating it. */}
      {(category === 'BACHELOR' || category === 'COLIVE') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          <RoomLayouts
            category={category}
            details={details}
            onChangeDetails={onChangeDetails}
            errors={errors}
          />

          {/* Furnishing Status */}
          {/* Furnishing is asked per LAYOUT now, inside each card above — a
              house commonly lets a semi-furnished 1 BHK and a fully-furnished
              2 BHK, and one status for the whole property could only ever
              describe one of them. */}

          {/* Allowed Tenants and Kitchen are asked per LAYOUT now, inside
              each card above. A building commonly lets its 1 RKs to men and
              its 2 BHKs to women, and puts a kitchen in some units and not
              others — one answer for the whole property could only ever
              describe part of it. */}
        </div>
      )}
    </div>
  );
}

/**
 * The occupancy chooser, and a monthly rent for each occupancy chosen.
 *
 * Its own component because it is the only part of this form that holds
 * state of its own — the half-typed custom occupancy, which is not a property
 * detail until it is added and so does not belong in `details`. CategoryFields
 * returns early when there is no category, so a hook could not live there.
 *
 * A custom option is nothing special once added: "6 Sharing" is a label like
 * any other, priced through the same `sharingPrices` map, and read by the
 * public site through the same normaliser. The only reason
 * `customSharingTypes` is stored at all is so the chip survives being
 * unticked — deriving the list from the ticked options alone would make an
 * option vanish the moment an agent unticked it to compare against another.
 */
/**
 * Room / flat layouts, multi-select, each with its own monthly rent.
 *
 * ## Why this replaced a dropdown
 *
 * The form used to ask for ONE layout. A bachelor building with 1 RKs on one
 * floor and 2 BHKs on another had to be filed as whichever the agent picked,
 * and the other layout — and its different rent — was simply lost. Every such
 * property was under-described from the moment it was onboarded.
 *
 * ## Where the numbers go
 *
 * The selection is `roomTypes`, and the rents go into `sharingPrices` — the
 * same map the PG sharing options write. That is deliberate rather than
 * convenient: `sharingPrices` is what the backend's occupancy reader, the
 * listing page's chooser and the bed-inventory service already consume, so a
 * layout priced here becomes a bookable option everywhere without any of
 * those learning a new key.
 *
 * The old singular `roomType` is still written alongside, set to the first
 * selected layout, so listings and screens that have not been updated keep
 * showing something true rather than a blank.
 */
/**
 * Key amenities included, driven by the furnishing level.
 *
 * Shown only for a fully- or semi-furnished let: an unfurnished one has
 * nothing to list, and rendering an empty checklist for it would invite an
 * agent to tick something that is not there.
 *
 * ## Custom items
 *
 * The two lists cover the common cases and will never cover all of them — a
 * study desk, a piano, a second geyser. An agent can add anything, and only
 * the added ones can be removed: deleting a preset would make two agents'
 * forms disagree about what the standard list even is.
 *
 * ## Changing level
 *
 * Switching between fully and semi prunes anything the new list does not
 * contain, because those ticks were answers to a different question. Custom
 * items survive the switch — they were typed for this property, not for the
 * level.
 */
/**
 * Bed types a hotel or dormitory offers, each with its own nightly price.
 *
 * ## Why this exists
 *
 * The form used to ask for one bed FORMAT — a bunk, a pod — and one flat
 * rate, which is not how anybody sells a room. A hostel with four-bed dorms
 * at ₹450 and a private double at ₹1,400 had to be filed as one of them, and
 * the other was invisible to anybody searching.
 *
 * ## Where the numbers go
 *
 * Selection is `bedTypes`; prices land in `sharingPrices`, AC in `sharingAC`
 * and `sharingAcPrices` — the same maps the PG sharing options and the
 * bachelor layouts write. That is what makes a priced bed a bookable option
 * everywhere without the occupancy reader, the listing chooser or the bed
 * inventory learning anything new.
 *
 * AC is priced per bed type rather than per property because it genuinely is:
 * a hostel commonly runs AC dorms and non-AC dorms in the same building at
 * different rates.
 */
/**
 * A row of preset chips plus anything the agent types.
 *
 * ## Why the presets are not enough on their own
 *
 * The lists here are the common cases and will never be all of them. A
 * building has a penthouse, a hostel sells a six-bed dorm, a house is let as a
 * 4 BHK. Every one of those had to be filed as the nearest preset, and the
 * listing then described a property that did not exist.
 *
 * ## Only what was added can be removed
 *
 * Deleting a preset would make two agents' forms disagree about what the
 * standard list even is. A custom option is this property's, so it carries an
 * X; the presets do not.
 *
 * Shared by the layout picker and the bed-type picker because the two behave
 * identically — they differ only in what they are called and what a new entry
 * should be seeded with, both of which are passed in.
 */
/**
 * The two documents a hotel has to produce.
 *
 * ## Why a hotel and nothing else
 *
 * A PG or a bachelor flat is somebody's house, and the WhatsApp chain already
 * confirms the owner answers on the number the property is filed under. A
 * hotel is a business taking money from strangers for a bed, so the platform
 * asks it to prove two things: who is being paid, and that they hold the
 * premises they are selling.
 *
 * ## Where these go, and why not into categoryDetails
 *
 * They are sent as a top-level `documents` array. `categoryDetails` is
 * returned verbatim by the public listing API, so a PAN filed there would be
 * served to anybody browsing the site. Nothing in the public projection
 * touches `documents`.
 *
 * The files stay on this device until submit — same as the photos — so an
 * abandoned form uploads nothing.
 */
function HotelDocuments({ details, onChangeDetails, errors }) {
  const docs = details.localDocuments || {};

  const setDoc = (kind, patch) => {
    onChangeDetails('localDocuments', {
      ...docs,
      [kind]: patch === null ? undefined : { ...(docs[kind] || {}), ...patch },
    });
  };

  const Slot = ({ kind, title, blurb, errorKey, children }) => {
    const current = docs[kind];
    return (
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
        <span style={{ fontSize: '0.88rem', color: '#181e1b', fontWeight: 700 }}>{title} *</span>
        <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '4px 0 10px', lineHeight: 1.4 }}>{blurb}</p>

        {children}

        {current?.file ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px',
            padding: '8px 12px', background: '#eaf3ed', border: '1px solid #c2e2cc', borderRadius: '8px',
          }}>
            <Check size={14} color="#45855a" />
            <span style={{ fontSize: '0.8rem', color: '#2f6b45', fontWeight: 600, flex: 1, wordBreak: 'break-all' }}>
              {current.file.name}
            </span>
            <button
              type="button"
              onClick={() => setDoc(kind, null)}
              title="Remove"
              aria-label={`Remove ${title}`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '20px', height: '20px', borderRadius: '50%', border: 'none',
                background: 'rgba(100, 116, 139, 0.15)', color: '#475569', cursor: 'pointer', padding: 0,
              }}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <label
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              marginTop: '10px', padding: '12px', borderRadius: '8px',
              border: '1px dashed #94a3b8', color: '#64748b', cursor: 'pointer',
              fontSize: '0.82rem', fontWeight: 600,
            }}
          >
            <CloudUpload size={15} />
            <span>Choose a photo or PDF</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files && e.target.files[0];
                if (file) setDoc(kind, { file });
                /* Cleared so picking the same file twice still fires. */
                e.target.value = '';
              }}
            />
          </label>
        )}

        <FieldError message={errors[errorKey]} />
      </div>
    );
  };

  return (
    <div className="form-group" style={{ gridColumn: '1 / -1' }} id="hotelDocuments">
      <label className="form-label">Verification Documents *</label>
      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px', lineHeight: 1.5 }}>
        A hotel takes money from strangers for a bed, so we ask it to show who is being paid and
        that they hold the premises. Both are required, and neither is shown on the public
        listing.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
        <Slot
          kind="pan"
          title="Owner / Business PAN"
          blurb="The PAN of the person or company that will be paid."
          errorKey="documents.pan"
        />

        <Slot
          kind="premises"
          title="Proof of Premises"
          blurb="Any one credible document establishing that this business holds this building."
          errorKey="documents.premises"
        >
          <select
            className="form-select"
            value={docs.premises?.docType || ''}
            onChange={(e) => setDoc('premises', { docType: e.target.value })}
            style={{ padding: '8px 12px', fontSize: '0.85rem' }}
          >
            <option value="">Which document is it?</option>
            {PREMISES_DOC_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </Slot>
      </div>
    </div>
  );
}


function ChipPicker({
  presets, custom, selected, label, error, addPrompt, addHint,
  onToggle, onAddCustom, onRemoveCustom, id,
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const presetIds = presets.map((o) => o.id);
  const options = [...presets, ...custom.filter((c) => !presetIds.includes(c)).map((c) => ({ id: c, label: c }))];

  const commit = () => {
    const text = draft.trim();
    if (!text) return;
    /* Case-insensitive, so "1 bhk" does not join a list that already says
       "1 BHK" and leave the property offering both. */
    const clash = options.find((o) => o.id.toLowerCase() === text.toLowerCase());
    if (clash) {
      if (!selected.includes(clash.id)) onToggle(clash.id);
    } else {
      onAddCustom(text);
    }
    setDraft('');
    setCustomOpen(false);
  };

  return (
    <div className="form-group" style={{ gridColumn: '1 / -1' }} id={id}>
      <label className="form-label">{label}</label>
      <FieldError message={error} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        {options.map((option) => {
          const isSelected = selected.includes(option.id);
          const isCustom = !presetIds.includes(option.id);
          return (
            <div
              key={option.id}
              onClick={() => onToggle(option.id)}
              style={{
                padding: isCustom ? '8px 8px 8px 16px' : '8px 16px',
                borderRadius: '20px',
                background: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: isSelected ? '1px solid #10b981' : '1px solid var(--border-glass)',
                color: isSelected ? '#34d399' : 'var(--text-sub)',
                cursor: 'pointer', fontSize: '0.875rem',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              {isSelected && <Check size={14} />}
              <span>{option.label}</span>
              {isCustom && (
                <button
                  type="button"
                  title={`Remove ${option.label}`}
                  aria-label={`Remove ${option.label}`}
                  onClick={(e) => { e.stopPropagation(); onRemoveCustom(option.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '18px', height: '18px', borderRadius: '50%', border: 'none',
                    background: 'rgba(100, 116, 139, 0.15)', color: 'inherit', cursor: 'pointer', padding: 0,
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => { setCustomOpen((o) => !o); setDraft(''); }}
          style={{
            padding: '8px 16px', borderRadius: '20px',
            background: customOpen ? '#eaf3ed' : 'transparent',
            border: `1px dashed ${customOpen ? '#45855a' : '#94a3b8'}`,
            color: customOpen ? '#2f6b45' : '#64748b',
            cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <Plus size={14} />
          <span>Custom</span>
        </button>
      </div>

      {customOpen && (
        <div style={{
          marginTop: '12px', padding: '14px 16px', background: '#ffffff',
          borderRadius: '12px', border: '1px solid #c2e2cc', maxWidth: '420px',
        }}>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginBottom: '8px' }}>
            {addPrompt}
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              className="form-input"
              autoFocus
              value={draft}
              maxLength={40}
              placeholder={addHint}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { setCustomOpen(false); setDraft(''); }
              }}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={commit}
              disabled={!draft.trim()}
              className="btn-primary"
              style={{ padding: '8px 18px', fontSize: '0.85rem', opacity: draft.trim() ? 1 : 0.5 }}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function BedTypes({ details, onChangeDetails, errors }) {
  const selected = Array.isArray(details.bedTypes)
    ? details.bedTypes
    /* A row created before this control carries one bed FORMAT string in
       `bedType`. That is a different question, so nothing is pre-selected
       from it — the agent picks the occupancies afresh. */
    : [];

  const prices = details.sharingPrices || {};

  const setMap = (mapField, key, value) => {
    const next = { ...(details[mapField] || {}) };
    if (value === '' || value === null || value === false) delete next[key];
    else next[key] = value;
    onChangeDetails(mapField, next);
  };

  const toggle = (bed) => {
    const has = selected.includes(bed);
    if (has) {
      /* A price for a bed nobody offers would resurface on the site, so it
         goes with the bed — and before the selection changes, because the
         headline-rate recompute hangs off `bedTypes` and should read the
         prices that are already gone. */
      ['sharingPrices', 'sharingAC', 'sharingAcPrices'].forEach((mapField) => {
        const map = details[mapField];
        if (map && map[bed] !== undefined) {
          const trimmed = { ...map };
          delete trimmed[bed];
          onChangeDetails(mapField, trimmed);
        }
      });
    }
    onChangeDetails('bedTypes', has ? selected.filter((b) => b !== bed) : [...selected, bed]);
  };

  const custom = Array.isArray(details.customBedTypes) ? details.customBedTypes : [];
  const bedOptions = [
    ...BED_TYPES.map((b) => ({ id: b, label: b })),
    ...custom.filter((c) => !BED_TYPES.includes(c)).map((c) => ({ id: c, label: c })),
  ];

  const removeCustom = (bed) => {
    if (selected.includes(bed)) toggle(bed);
    onChangeDetails('customBedTypes', custom.filter((b) => b !== bed));
  };

  return (
    <div>
      <ChipPicker
        id="bedTypes"
        label="Bed Types Available *"
        error={errors['categoryDetails.bedTypes']}
        presets={BED_TYPES.map((b) => ({ id: b, label: b }))}
        custom={custom}
        selected={selected}
        addPrompt="What else does this place sell a bed in?"
        addHint="e.g. 6 Sharing, Family Room"
        onToggle={toggle}
        onAddCustom={(text) => {
          onChangeDetails('customBedTypes', [...custom, text]);
          onChangeDetails('bedTypes', [...selected, text]);
        }}
        onRemoveCustom={removeCustom}
      />

      {selected.length > 0 && (
        <div>
          {bedOptions.filter((b) => selected.includes(b.id)).map(({ id: bed }) => {
            const hasAC = !!(details.sharingAC && details.sharingAC[bed]);
            return (
              <div
                key={bed}
                style={{
                  background: '#f8faf8', border: '1px solid #e2e8f0',
                  borderRadius: '10px', padding: '14px', marginBottom: '12px',
                }}
              >
                <span style={{ fontSize: '0.88rem', color: '#181e1b', fontWeight: 700 }}>{bed}</span>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '10px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>Total Beds Available *</span>
                    <input
                      type="number"
                      className="form-input"
                      id={`sharingRooms-${bed}`}
                      min="0"
                      placeholder="e.g. 12"
                      value={(details.sharingBeds || {})[bed] ?? ''}
                      onChange={(e) => setMap('sharingBeds', bed, Number(e.target.value) || '')}
                      style={{ marginTop: '4px', padding: '8px 12px', fontSize: '0.85rem', borderColor: errorBorder(errors[roomCountKey(bed)]) }}
                    />
                    <FieldError message={errors[roomCountKey(bed)]} />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', cursor: 'pointer', paddingBottom: '8px' }}>
                    <input
                      type="checkbox"
                      checked={hasAC}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setMap('sharingAC', bed, isChecked);
                        /* An AC rate for a bed with no AC would resurface as a
                           price on the site, so all three go with the tick. */
                        if (!isChecked) {
                          RATE_STRUCTURES.forEach((rate) => setMap(rate.ac, bed, ''));
                        }
                      }}
                      style={{ width: '15px', height: '15px', accentColor: '#45855a' }}
                    />
                    <span style={{ fontSize: '0.78rem', color: hasAC ? '#45855a' : '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Snowflake size={12} />
                      <span>AC available for {bed}</span>
                    </span>
                  </label>
                </div>

                {/* The rate grid: three structures, and an AC column only when
                    AC is on offer. A hostel sells the same bed nightly to a
                    traveller and monthly to a student. */}
                <div style={{ marginTop: '12px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: '#45855a', fontWeight: 600, marginBottom: '10px' }}>
                    Rates for {bed} — fill in the ones this hostel actually offers
                  </span>

                  <div style={{ display: 'grid', gridTemplateColumns: hasAC ? '1fr 1fr 1fr' : '1fr 1fr', gap: '10px', alignItems: 'end' }}>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Structure</span>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Non-AC (₹)</span>
                    {hasAC && (
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>AC (₹)</span>
                    )}

                    {RATE_STRUCTURES.map((rate) => (
                      <React.Fragment key={rate.id}>
                        <span style={{ fontSize: '0.82rem', color: '#181e1b', fontWeight: 600, paddingBottom: '10px' }}>
                          {rate.label}{rate.required ? ' *' : ''}
                        </span>
                        <div>
                          <input
                            type="number"
                            className="form-input"
                            id={rate.required ? `sharingPrice-${bed}` : `${rate.base}-${bed}`}
                            min="0"
                            placeholder={rate.hint}
                            value={(details[rate.base] || {})[bed] ?? ''}
                            onChange={(e) => setMap(rate.base, bed, Number(e.target.value) || '')}
                            style={{ padding: '8px 12px', fontSize: '0.85rem', borderColor: rate.required ? errorBorder(errors[sharingPriceKey(bed)]) : undefined }}
                          />
                          {rate.required && <FieldError message={errors[sharingPriceKey(bed)]} />}
                        </div>
                        {hasAC && (
                          <div>
                            <input
                              type="number"
                              className="form-input"
                              id={rate.required ? `sharingAcPrice-${bed}` : `${rate.ac}-${bed}`}
                              min="0"
                              placeholder={rate.hint}
                              value={(details[rate.ac] || {})[bed] ?? ''}
                              onChange={(e) => setMap(rate.ac, bed, Number(e.target.value) || '')}
                              style={{ padding: '8px 12px', fontSize: '0.85rem', borderColor: rate.required ? errorBorder(errors[sharingAcPriceKey(bed)]) : '#c2e2cc' }}
                            />
                            {rate.required && <FieldError message={errors[sharingAcPriceKey(bed)]} />}
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


/**
 * The amenity checklist for one furnishing level.
 *
 * Takes its value and its setter rather than reading `details`, because it is
 * rendered once per LAYOUT now — a house may let a semi-furnished 1 BHK and a
 * fully-furnished 2 BHK, and each carries its own list.
 */
function FurnishingItems({ level, selected, custom, onChangeSelected, onChangeCustom, label }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const base = FURNISHING_ITEMS[level];
  if (!base) return null;

  const options = [...base, ...custom.filter((c) => !base.includes(c))];

  const toggle = (item) => {
    onChangeSelected(
      selected.includes(item) ? selected.filter((i) => i !== item) : [...selected, item],
    );
  };

  const addCustom = () => {
    const text = draft.trim();
    if (!text) return;
    /* Case-insensitive, so "wifi" does not join a list that already says
       "Wi-Fi" and leave the listing claiming both. */
    const clash = options.find((o) => o.toLowerCase() === text.toLowerCase());
    if (clash) {
      if (!selected.includes(clash)) toggle(clash);
    } else {
      onChangeCustom([...custom, text]);
      onChangeSelected([...selected, text]);
    }
    setDraft('');
    setCustomOpen(false);
  };

  const removeCustom = (item) => {
    onChangeCustom(custom.filter((i) => i !== item));
    onChangeSelected(selected.filter((i) => i !== item));
  };

  return (
    <div style={{ marginTop: '12px' }}>
      <span style={{ display: 'block', fontSize: '0.75rem', color: '#45855a', fontWeight: 600, marginBottom: '8px' }}>
        {label || 'Key Amenities Included'}
      </span>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        {options.map((item) => {
          const isSelected = selected.includes(item);
          const isCustom = !base.includes(item);
          return (
            <div
              key={item}
              onClick={() => toggle(item)}
              style={{
                padding: isCustom ? '6px 6px 6px 12px' : '6px 12px',
                borderRadius: '18px',
                background: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: isSelected ? '1px solid #10b981' : '1px solid var(--border-glass)',
                color: isSelected ? '#34d399' : 'var(--text-sub)',
                cursor: 'pointer', fontSize: '0.8rem',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {isSelected && <Check size={12} />}
              <span>{item}</span>
              {isCustom && (
                <button
                  type="button"
                  title={`Remove ${item}`}
                  aria-label={`Remove ${item}`}
                  onClick={(e) => { e.stopPropagation(); removeCustom(item); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '16px', height: '16px', borderRadius: '50%', border: 'none',
                    background: 'rgba(100, 116, 139, 0.15)', color: 'inherit', cursor: 'pointer', padding: 0,
                  }}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => { setCustomOpen((o) => !o); setDraft(''); }}
          style={{
            padding: '6px 12px', borderRadius: '18px',
            background: customOpen ? '#eaf3ed' : 'transparent',
            border: `1px dashed ${customOpen ? '#45855a' : '#94a3b8'}`,
            color: customOpen ? '#2f6b45' : '#64748b',
            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: '5px',
          }}
        >
          <Plus size={12} />
          <span>Custom</span>
        </button>
      </div>

      {customOpen && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', maxWidth: '380px' }}>
          <input
            type="text"
            className="form-input"
            autoFocus
            value={draft}
            maxLength={40}
            placeholder="e.g. Study Desk"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
              if (e.key === 'Escape') { setCustomOpen(false); setDraft(''); }
            }}
            style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!draft.trim()}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.82rem', opacity: draft.trim() ? 1 : 0.5 }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Room / flat layouts, multi-select, each priced and described on its own.
 *
 * ## Why every question here is per-layout
 *
 * A house is not one thing. The same building lets a semi-furnished 1 BHK at
 * ₹12,000 and a fully-furnished 2 BHK at ₹22,000, and there are three of the
 * first and one of the second. The form used to ask for ONE layout and ONE
 * furnishing status for the whole property, which meant every listing was
 * describing whichever flat the agent happened to think of — and the rest were
 * invisible to anybody searching.
 *
 * So each selected layout carries its own rent, its own count, its own
 * furnishing level and its own amenity list.
 *
 * ## Where the numbers go
 *
 * Selection is `roomTypes`; rents go to `sharingPrices`, counts to
 * `sharingRooms` and `sharingBeds` — the same maps the PG sharing options and
 * the hotel bed types write, which is what makes a priced layout bookable
 * inventory without anything downstream learning a new key. A whole-flat let
 * is one lettable unit, so beds equal the count rather than being multiplied
 * out by an occupancy.
 *
 * Furnishing is `furnishingByLayout` and `furnishingItemsByLayout`. The
 * top-level `furnishing` and `furnishingItems` are still written, derived in
 * App.jsx, so every screen that reads them keeps working.
 */
function RoomLayouts({ category, details, onChangeDetails, errors }) {
  const tenantOptions = TENANT_OPTIONS[category] || TENANT_OPTIONS.COLIVE;
  const selected = Array.isArray(details.roomTypes)
    ? details.roomTypes
    /* A row created before this control carries one layout as a string. */
    : (details.roomType ? [details.roomType] : []);

  const prices = details.sharingPrices || {};
  const counts = details.sharingRooms || {};
  const byLayout = details.furnishingByLayout || {};
  const tenantsByLayout = details.allowedTenantsByLayout || {};
  const kitchenByLayout = details.kitchenByLayout || {};
  const itemsByLayout = details.furnishingItemsByLayout || {};
  const custom = Array.isArray(details.customFurnishingItems) ? details.customFurnishingItems : [];

  const setMap = (mapField, key, value) => {
    const next = { ...(details[mapField] || {}) };
    if (value === '' || value === null || value === undefined) delete next[key];
    else next[key] = value;
    onChangeDetails(mapField, next);
  };

  const toggle = (layout) => {
    const has = selected.includes(layout);
    const next = has ? selected.filter((l) => l !== layout) : [...selected, layout];

    if (has) {
      /* Everything recorded against a layout nobody offers would resurface on
         the site, so it all goes with the layout — and before the selection
         changes, because the headline-rent recompute hangs off `roomTypes`. */
      ['sharingPrices', 'sharingRooms', 'sharingBeds', 'furnishingByLayout',
        'furnishingItemsByLayout', 'allowedTenantsByLayout', 'kitchenByLayout']
        .forEach((mapField) => {
          const map = details[mapField];
          if (map && map[layout] !== undefined) {
            const trimmed = { ...map };
            delete trimmed[layout];
            onChangeDetails(mapField, trimmed);
          }
        });
    } else {
      /* A new layout opens on the same level as the last one an agent chose,
         which is right far more often than a fixed default: a building is
         usually furnished to one standard throughout. */
      const last = selected.length ? selected[selected.length - 1] : null;
      setMap('furnishingByLayout', layout, (last && byLayout[last]) || 'Semi-Furnished');
      setMap('allowedTenantsByLayout', layout, (last && tenantsByLayout[last]) || tenantOptions[0].id);
      setMap('kitchenByLayout', layout, last && kitchenByLayout[last] !== undefined
        ? kitchenByLayout[last]
        : true);
    }

    onChangeDetails('roomTypes', next);
    onChangeDetails('roomType', next[0] || '');
  };

  const customLayouts = Array.isArray(details.customRoomTypes) ? details.customRoomTypes : [];
  const presetIds = ROOM_LAYOUTS.map((l) => l.id);
  const layoutOptions = [
    ...ROOM_LAYOUTS,
    ...customLayouts.filter((c) => !presetIds.includes(c)).map((c) => ({ id: c, label: c })),
  ];

  const removeCustomLayout = (layout) => {
    if (selected.includes(layout)) toggle(layout);
    onChangeDetails('customRoomTypes', customLayouts.filter((l) => l !== layout));
  };

  return (
    <div>
      <ChipPicker
        id="roomTypes"
        label="Room / Flat Layouts Available *"
        error={errors['categoryDetails.roomTypes']}
        presets={ROOM_LAYOUTS}
        custom={customLayouts}
        selected={selected}
        addPrompt="What other layout does this building let?"
        addHint="e.g. 4 BHK Villa, Penthouse"
        onToggle={toggle}
        onAddCustom={(text) => {
          onChangeDetails('customRoomTypes', [...customLayouts, text]);
          /* Selected straight away, and seeded like any other new layout —
             `toggle` does that, so it is called rather than duplicated. */
          toggle(text);
        }}
        onRemoveCustom={removeCustomLayout}
      />

      {layoutOptions.filter((l) => selected.includes(l.id)).map((layout) => {
        const level = byLayout[layout.id] || 'Semi-Furnished';
        return (
          <div
            key={layout.id}
            style={{
              background: '#f8faf8', border: '1px solid #e2e8f0',
              borderRadius: '10px', padding: '14px', marginBottom: '12px',
            }}
          >
            <span style={{ fontSize: '0.88rem', color: '#181e1b', fontWeight: 700 }}>{layout.label}</span>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '10px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>Monthly Rent (₹) *</span>
                <input
                  type="number"
                  className="form-input"
                  id={`sharingPrice-${layout.id}`}
                  min="0"
                  placeholder="e.g. 12000"
                  value={prices[layout.id] ?? ''}
                  onChange={(e) => setMap('sharingPrices', layout.id, Number(e.target.value) || '')}
                  style={{ marginTop: '4px', padding: '8px 12px', fontSize: '0.85rem', borderColor: errorBorder(errors[sharingPriceKey(layout.id)]) }}
                />
                <FieldError message={errors[sharingPriceKey(layout.id)]} />
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>How many of these?</span>
                <input
                  type="number"
                  className="form-input"
                  id={`sharingRooms-${layout.id}`}
                  min="0"
                  placeholder="e.g. 3"
                  value={counts[layout.id] ?? ''}
                  onChange={(e) => {
                    const count = Number(e.target.value) || '';
                    setMap('sharingRooms', layout.id, count);
                    /* One flat is one lettable unit, so beds equal the count.
                       Written rather than derived on read, because that is the
                       number the request flow decrements. */
                    setMap('sharingBeds', layout.id, count);
                  }}
                  style={{ marginTop: '4px', padding: '8px 12px', fontSize: '0.85rem' }}
                />
                <span style={{ fontSize: '0.72rem', color: counts[layout.id] ? '#45855a' : '#94a3b8', fontWeight: 600 }}>
                  {counts[layout.id]
                    ? `${counts[layout.id]} available to let`
                    : 'How many of this layout the building has'}
                </span>
                <FieldError message={errors[roomCountKey(layout.id)]} />
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>Furnishing Status</span>
                <select
                  className="form-select"
                  value={level}
                  onChange={(e) => {
                    const next = e.target.value;
                    setMap('furnishingByLayout', layout.id, next);

                    /* The ticked amenities answered the previous level's list,
                       so anything the new one does not offer is dropped.
                       Custom items were typed for this property rather than
                       for a level, so they stay. Unfurnished clears the lot. */
                    const base = FURNISHING_ITEMS[next] || [];
                    const ticked = itemsByLayout[layout.id] || [];
                    setMap(
                      'furnishingItemsByLayout',
                      layout.id,
                      base.length ? ticked.filter((i) => base.includes(i) || custom.includes(i)) : [],
                    );
                  }}
                  style={{ marginTop: '4px', padding: '8px 12px', fontSize: '0.85rem' }}
                >
                  <option value="Fully Furnished">Fully Furnished</option>
                  <option value="Semi-Furnished">Semi-Furnished</option>
                  <option value="Unfurnished">Unfurnished</option>
                </select>
                <FieldError message={errors[furnishingKey(layout.id)]} />
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>Allowed Tenants</span>
                <select
                  className="form-select"
                  value={tenantsByLayout[layout.id] || tenantOptions[0].id}
                  onChange={(e) => setMap('allowedTenantsByLayout', layout.id, e.target.value)}
                  style={{ marginTop: '4px', padding: '8px 12px', fontSize: '0.85rem' }}
                >
                  {tenantOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                  {/* A value saved before this list was narrowed stays
                      selectable, so editing an old listing cannot silently
                      change who it is let to. */}
                  {tenantsByLayout[layout.id]
                    && !tenantOptions.some((o) => o.id === tenantsByLayout[layout.id]) ? (
                      <option value={tenantsByLayout[layout.id]}>{tenantsByLayout[layout.id]}</option>
                    ) : null}
                </select>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>Kitchen / Cooking Provision?</span>
                <select
                  className="form-select"
                  value={kitchenByLayout[layout.id] === false ? 'No' : 'Yes'}
                  onChange={(e) => setMap('kitchenByLayout', layout.id, e.target.value === 'Yes')}
                  style={{ marginTop: '4px', padding: '8px 12px', fontSize: '0.85rem' }}
                >
                  <option value="Yes">Yes (Kitchen &amp; Cooking Allowed)</option>
                  <option value="No">No Kitchen Setup</option>
                </select>
              </div>
            </div>

            <FurnishingItems
              level={level}
              selected={itemsByLayout[layout.id] || []}
              custom={custom}
              label={`Key Amenities Included — what the ${level.toLowerCase()} ${layout.label} gets them`}
              onChangeSelected={(next) => setMap('furnishingItemsByLayout', layout.id, next)}
              onChangeCustom={(next) => onChangeDetails('customFurnishingItems', next)}
            />
          </div>
        );
      })}
    </div>
  );
}



function SharingOptions({ details, onChangeDetails, onToggleType, setMapValue, errors = {} }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customCount, setCustomCount] = useState('');
  const [customError, setCustomError] = useState('');

  const selected = Array.isArray(details.sharingTypes) ? details.sharingTypes : [];
  const custom = Array.isArray(details.customSharingTypes) ? details.customSharingTypes : [];

  /* Standard options, then the ones this agent added, then anything already
     ticked that matches neither — the last of which stops a listing edited
     elsewhere from losing an option it is already priced on. */
  const options = [...BASE_SHARING_TYPES, ...custom.filter((t) => !BASE_SHARING_TYPES.includes(t))];
  selected.forEach((t) => { if (!options.includes(t)) options.push(t); });

  const closeCustom = () => {
    setCustomOpen(false);
    setCustomCount('');
    setCustomError('');
  };

  const addCustom = () => {
    const count = Number(customCount);
    if (!customCount || !Number.isInteger(count) || count < 1 || count > 50) {
      setCustomError('Enter how many people share one room (1–50).');
      return;
    }

    const label = sharingLabelFor(count);
    if (!options.includes(label)) {
      onChangeDetails('customSharingTypes', [...custom, label]);
    }
    /* Adding an option is the act of choosing it — nobody types an occupancy
       in order to leave it unticked. Re-adding one that already exists just
       ticks it, which is the useful reading of the same gesture. */
    if (!selected.includes(label)) {
      onChangeDetails('sharingTypes', [...selected, label]);
    }
    closeCustom();
  };

  /** Removing a custom option takes its prices with it, exactly as unticking
   *  a standard one does — a stale price would keep counting toward the
   *  headline rent App.jsx derives from this map. */
  const removeCustom = (label) => {
    ['sharingPrices', 'sharingAC', 'sharingAcPrices', 'sharingRooms', 'sharingBeds'].forEach((mapField) => {
      const map = details[mapField];
      if (map && map[label] !== undefined) {
        const trimmed = { ...map };
        delete trimmed[label];
        onChangeDetails(mapField, trimmed);
      }
    });
    onChangeDetails('customSharingTypes', custom.filter((t) => t !== label));
    // Last: the headline-rent recompute hangs off this key and should run
    // once the prices it reads are already gone.
    onChangeDetails('sharingTypes', selected.filter((t) => t !== label));
  };

  return (
    <div id="sharingOptions" className="form-group" style={{ gridColumn: '1 / -1' }}>
      <label className="form-label">Sharing Options Available *</label>
      <FieldError message={errors['categoryDetails.sharingTypes']} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        {options.map((type) => {
          const isSelected = selected.includes(type);
          const isCustom = !BASE_SHARING_TYPES.includes(type);
          return (
            <div
              key={type}
              onClick={() => onToggleType(type)}
              style={{
                padding: isCustom ? '8px 8px 8px 16px' : '8px 16px',
                borderRadius: '20px',
                background: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: isSelected ? '1px solid #10b981' : '1px solid var(--border-glass)',
                color: isSelected ? '#34d399' : 'var(--text-sub)',
                cursor: 'pointer',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {isSelected && <Check size={14} />}
              <span>{type}</span>
              {isCustom && (
                <button
                  type="button"
                  title={`Remove ${type}`}
                  aria-label={`Remove ${type}`}
                  onClick={(e) => { e.stopPropagation(); removeCustom(type); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(100, 116, 139, 0.15)',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}

        {/* Custom — sits after base sharing options, and reads as an action rather
            than a preset occupancy, hence the dashed border. */}
        <button
          type="button"
          onClick={() => (customOpen ? closeCustom() : setCustomOpen(true))}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            background: customOpen ? '#eaf3ed' : 'transparent',
            border: `1px dashed ${customOpen ? '#45855a' : '#94a3b8'}`,
            color: customOpen ? '#2f6b45' : '#64748b',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Plus size={14} />
          <span>Custom</span>
        </button>
      </div>

      {customOpen && (
        <div style={{
          marginTop: '12px',
          padding: '14px 16px',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #c2e2cc',
          maxWidth: '420px'
        }}>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginBottom: '8px' }}>
            How many people share one room?
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <input
              type="number"
              min="1"
              max="50"
              autoFocus
              placeholder="e.g. 6"
              value={customCount}
              onChange={(e) => { setCustomCount(e.target.value); setCustomError(''); }}
              // The panel is inside the onboarding <form>; Enter here means
              // "add this option", never "submit the whole property".
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
                if (e.key === 'Escape') closeCustom();
              }}
              className="form-input"
              style={{ width: '110px', padding: '8px 12px', fontSize: '0.85rem' }}
            />
            <button
              type="button"
              onClick={addCustom}
              className="btn btn-primary"
              style={{ padding: '8px 18px', background: '#45855a', borderRadius: '10px', fontSize: '0.85rem' }}
            >
              <Plus size={15} />
              <span>Add option</span>
            </button>
            <button
              type="button"
              onClick={closeCustom}
              style={{ padding: '8px 14px', borderRadius: '10px', background: '#ffffff', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>

          {customError
            ? <span style={{ display: 'block', fontSize: '0.78rem', color: '#dc2626', marginTop: '8px' }}>{customError}</span>
            : (
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginTop: '8px' }}>
                {customCount && Number(customCount) > 0 && Number(customCount) <= 50 && Number.isInteger(Number(customCount))
                  ? `Adds "${sharingLabelFor(Number(customCount))}" with its own rent and AC option.`
                  : 'Adds an occupancy the list above does not cover, e.g. 6 gives "6 Sharing".'}
              </span>
            )}
        </div>
      )}

      {/* Sharing Prices (Dynamic based on selected sharing types) */}
      {selected.length > 0 && (
        <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(0, 0, 0, 0.02)', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
          <label className="form-label" style={{ fontSize: '0.85rem', color: '#181e1b', fontWeight: 700, marginBottom: '10px' }}>
            Monthly Price for Selected Sharing Options (₹):
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {selected.map((type) => {
              const currentPrice = details.sharingPrices ? details.sharingPrices[type] : '';
              const hasAC = !!(details.sharingAC && details.sharingAC[type]);
              const acPrice = details.sharingAcPrices ? details.sharingAcPrices[type] : '';

              /* How many of this room type exist, and therefore how many beds.
                 This is the number the app claims against when an owner accepts
                 a request — without it the option cannot be requested at all,
                 which is why it is marked required rather than left for later. */
              const occupancy = occupancyOf(type);
              const rooms = details.sharingRooms ? details.sharingRooms[type] : '';
              const beds = details.sharingBeds ? details.sharingBeds[type] : '';
              const derivedBeds = occupancy && Number(rooms) > 0 ? Number(rooms) * occupancy : null;

              return (
                <div
                  key={type}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '12px',
                    background: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>{type} Rent *</span>
                  <input
                    id={`sharingPrice-${type}`}
                    type="number"
                    min="0"
                    placeholder="e.g. 6000"
                    value={currentPrice || ''}
                    onChange={(e) => setMapValue('sharingPrices', type, Number(e.target.value) || '')}
                    className="form-input"
                    style={{ padding: '8px 12px', fontSize: '0.85rem', borderColor: errorBorder(errors[sharingPriceKey(type)]) }}
                  />
                  <FieldError message={errors[sharingPriceKey(type)]} />

                  {/* ── How many rooms, and therefore how many beds ──────
                      The agent counts rooms because that is what they are
                      standing in front of; the app needs beds, so the two are
                      multiplied out and both are stored. A label that does not
                      say how many share a room ("Dorm Sharing", and anything
                      added through Custom that does not parse) is asked for
                      beds directly. */}
                  {occupancy ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                      <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                        How many {type} rooms? *
                      </span>
                      <input
                        id={`sharingRooms-${type}`}
                        type="number"
                        min="0"
                        placeholder="e.g. 3"
                        value={rooms || ''}
                        onChange={(e) => {
                          const count = Number(e.target.value) || '';
                          setMapValue('sharingRooms', type, count);
                          /* Beds are written too, not just derived on read —
                             the backend accepts either, and an explicit number
                             survives somebody later renaming the label. */
                          setMapValue('sharingBeds', type, count ? count * occupancy : '');
                        }}
                        className="form-input"
                        style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                      />
                      <span style={{ fontSize: '0.72rem', color: derivedBeds ? '#45855a' : '#94a3b8', fontWeight: 600 }}>
                        {derivedBeds
                          ? `${rooms} × ${occupancy} = ${derivedBeds} beds available`
                          : `${occupancy} ${occupancy === 1 ? 'person' : 'people'} per room`}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                      <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                        Total {type} beds *
                      </span>
                      <input
                        id={`sharingBeds-${type}`}
                        type="number"
                        min="0"
                        placeholder="e.g. 12"
                        value={beds || ''}
                        onChange={(e) => setMapValue('sharingBeds', type, Number(e.target.value) || '')}
                        className="form-input"
                        style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                      />
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>
                        We cannot tell how many share a {type} room, so enter the beds directly.
                      </span>
                    </div>
                  )}

                  {/* AC is priced per sharing option, not per property */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '2px' }}>
                    <input
                      type="checkbox"
                      checked={hasAC}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setMapValue('sharingAC', type, isChecked);
                        if (!isChecked && details.sharingAcPrices && details.sharingAcPrices[type] !== undefined) {
                          const trimmed = { ...details.sharingAcPrices };
                          delete trimmed[type];
                          onChangeDetails('sharingAcPrices', trimmed);
                        }
                      }}
                      style={{ width: '16px', height: '16px', accentColor: '#45855a', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.78rem', color: hasAC ? '#45855a' : '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Snowflake size={13} />
                      <span>AC available for {type}</span>
                    </span>
                  </label>

                  {hasAC && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>{type} AC Rent (₹) *</span>
                      <input
                        id={`sharingAcPrice-${type}`}
                        type="number"
                        min="0"
                        placeholder="e.g. 8000"
                        value={acPrice || ''}
                        onChange={(e) => setMapValue('sharingAcPrices', type, Number(e.target.value) || '')}
                        className="form-input"
                        style={{ padding: '8px 12px', fontSize: '0.85rem', borderColor: errorBorder(errors[sharingAcPriceKey(type)]) || '#c2e2cc' }}
                      />
                      <FieldError message={errors[sharingAcPriceKey(type)]} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
