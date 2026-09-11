import React, { useState } from 'react';
import { Utensils, ShieldCheck, Bed, Key, Check, X } from 'lucide-react';
import { FieldError, errorBorder } from '../../atoms/FieldError/FieldError';
import {
  sharingPriceKey, sharingAcPriceKey, furnishingKey, roomCountKey,
} from '../../../../services/validation.js';
import { MEAL_OPTIONS, BASE_SHARING_TYPES } from '../../utils/categoryFieldOptions';
import { MEAL_TIMING_PLACEHOLDERS, DEPENDENT_MAPS, CATEGORY_LABEL, CATEGORY_BADGE } from '../../utils/categoryFieldMaps';
import { COMMERCIAL_USES, COMMERCIAL_FLOORS, COMMERCIAL_FURNISHING, COMMERCIAL_WASHROOM, COMMERCIAL_PARKING } from '../../utils/commercialOptions';
import { HotelDocuments } from '../HotelDocuments';
import { BedTypes } from '../BedTypes';
import { RoomLayouts } from '../RoomLayouts';
import { SharingOptions } from '../SharingOptions';
import { Box, Heading, Inline, Input, Label, Option, PlainButton, Select, TextArea } from '../../../common/atoms';


/* The occupancies most properties are laid out in. Anything else is added
   through "Custom" and recorded in `customSharingTypes` — see SharingOptions
   at the bottom of this file. */

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

/*
 * What counts as credible evidence that this hotel is this hotel.
 *
 * Any one of them will do — the point is that SOMETHING official ties the
 * business to the premises, and which document an owner happens to hold
 * varies by state, by age of the building and by whether they own or lease.
 * Demanding a specific one would turn a legitimate hotel away.
 */

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

/*
 * Room / flat layouts for the whole-property categories.
 *
 * A property is rarely one layout. A building let to bachelors commonly has
 * 1 RKs on one floor and 2 BHKs on another at a different rent, and the form
 * used to make an agent pick one and lose the rest — so this is a multi-select
 * with a rent against each, the same shape the sharing options use.
 */

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


/** People per room → the label the rest of the platform keys prices by.
 *  1 resolves onto "Single" rather than minting "1 Sharing": the public site,
 *  the visit-request validator and the admin console all already know the one
 *  word for it, and a second name for the same thing would not match. */


// Keyed maps that hang off a checkbox list: deselecting an option must take its
// entries with it, or a stale price would keep counting toward the headline rent.

/*
 * Codes to words, and codes to the badge colour they already had.
 *
 * PG_HOSTEL keeps the PG badge because that is the great majority of what it
 * covers, and a hostel onboarded under it is still, visually, the same kind
 * of thing. See Backend/src/shared/constants/categories.js for the codes.
 */


/**
 * What a commercial unit is going to be used for.
 *
 * Multi-select, because a bare 400 sq ft shell on a main road is genuinely
 * offered to a chemist, a mobile shop and a tailor at the same time, and an
 * owner who has to pick one is being asked a question they cannot answer. It
 * is what a prospective tenant filters on, so it is the first thing asked.
 */

/** Where in the building it sits. Ground and the road it faces are most of
 *  what a retail rent is; anything above the first is an office question. */

/** Bare shell is the default and the commonest — commercial is handed over
 *  empty far more often than a home is. */



export function CategoryFieldsStep({ category, details = {}, onChangeDetails, errors = {} }) {
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
          if (mapField === 'localSharingImages') {
            (details[mapField][item] || []).forEach((staged) => {
              if (staged?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(staged.previewUrl);
            });
          }
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
    <Box className="animate-fade-in" style={{
      marginBottom: '28px',
      padding: '24px',
      background: '#f8faf8',
      borderRadius: 'var(--radius-md)',
      border: '1px solid #e2e8f0'
    }}>
      <Heading level={3} style={{ fontSize: '1.2rem', color: '#181e1b', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Inline className={`badge ${CATEGORY_BADGE[category] || 'badge-bachelor'}`}>
          {CATEGORY_LABEL[category] || category}
        </Inline>
        <Inline>Category Specific Details ({CATEGORY_LABEL[category] || category})</Inline>
      </Heading>

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
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          {/* Food Included */}
          <Box className="form-group">
            <Label className="form-label">Food Provided? *</Label>
            <Box style={{ display: 'flex', gap: '12px' }}>
              <PlainButton
                type="button"
                className={`btn ${details.foodIncluded ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, padding: '10px' }}
                onClick={() => handleToggle('foodIncluded', true)}
              >
                Yes (Food Included)
              </PlainButton>
              <PlainButton
                type="button"
                className={`btn ${!details.foodIncluded ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, padding: '10px' }}
                onClick={() => handleToggle('foodIncluded', false)}
              >
                No Food
              </PlainButton>
            </Box>
          </Box>

          {/* Food Type */}
          {details.foodIncluded && (
            <Box className="form-group">
              <Label className="form-label">Food Type</Label>
              <Select
                className="form-select"
                value={details.foodType || 'Both (Veg & Non-Veg)'}
                onChange={(e) => onChangeDetails('foodType', e.target.value)}
              >
                <Option value="Both (Veg & Non-Veg)">Both (Veg & Non-Veg)</Option>
                <Option value="Veg Only">Veg Only</Option>
                <Option value="Non-Veg Allowed">Non-Veg Allowed</Option>
              </Select>
            </Box>
          )}

          {/* Meals Served — which of the three, and when */}
          {details.foodIncluded && (
            <Box id="mealsProvided" className="form-group" style={{ gridColumn: '1 / -1' }}>
              <Label className="form-label">Meals Provided *</Label>
              <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {MEAL_OPTIONS.map((meal) => {
                  const isSelected = selectedMeals.includes(meal);
                  return (
                    <Box
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
                      <Inline>{meal}</Inline>
                    </Box>
                  );
                })}
              </Box>
              <FieldError message={errors['categoryDetails.mealsProvided']} />

              {/* Serving time for each meal that is actually served */}
              {selectedMeals.length > 0 && (
                <Box style={{ marginTop: '16px', padding: '16px', background: 'rgba(0, 0, 0, 0.02)', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                  <Label className="form-label" style={{ fontSize: '0.85rem', color: '#181e1b', fontWeight: 700, marginBottom: '10px' }}>
                    Serving Timings for Selected Meals:
                  </Label>
                  <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    {MEAL_OPTIONS.filter((meal) => selectedMeals.includes(meal)).map((meal) => (
                      <Box key={meal} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <Inline style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>{meal} Timing</Inline>
                        <Input
                          type="text"
                          placeholder={MEAL_TIMING_PLACEHOLDERS[meal]}
                          value={(details.mealTimings || {})[meal] || ''}
                          onChange={(e) => setMapValue('mealTimings', meal, e.target.value)}
                          className="form-input"
                          style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                        />
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
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
          <Box className="form-group">
            <Label className="form-label">Curfew / Gate Timing</Label>
            <Input
              type="text"
              placeholder="e.g. 10:30 PM or No Curfew"
              value={details.curfewTime || ''}
              onChange={(e) => onChangeDetails('curfewTime', e.target.value)}
              className="form-input"
            />
          </Box>
        </Box>
      )}

      {/* ==================== HOSTEL FORM ==================== */}
      {category === 'PG_HOSTEL' && (
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          {/* Hostel Type */}
          <Box className="form-group">
            <Label className="form-label">Hostel Type *</Label>
            {/*
              * `value`'s `|| 'Boys Hostel'` is a DISPLAY fallback only — it
              * makes the select show something rather than nothing before
              * `categoryDetails.hostelType` is seeded, but it never writes
              * that value back. App.jsx now seeds a real one on both the
              * page's initial state and on `handleCategorySelect('PG_HOSTEL')`,
              * so this should stay decorative in practice. The `id` and
              * `FieldError` below are the fallback for the fallback: if
              * `hostelType` is ever genuinely unset (a draft saved before
              * that seeding existed, say), the required-field error on submit
              * used to have nowhere to point — no `id` here to scroll to and
              * no message printed — so it looked like the form was stuck on a
              * field that was already filled in. See `FIELD_ANCHORS` in
              * validation.js.
              */}
            <Select
              id="hostelType"
              className="form-select"
              value={details.hostelType || 'Boys Hostel'}
              onChange={(e) => onChangeDetails('hostelType', e.target.value)}
              style={{ borderColor: errorBorder(errors['categoryDetails.hostelType']) }}
            >
              <Option value="Boys Hostel">Boys Hostel</Option>
              <Option value="Girls Hostel">Girls Hostel</Option>
              <Option value="Co-ed Hostel">Co-ed Hostel</Option>
            </Select>
            <FieldError message={errors['categoryDetails.hostelType']} />
          </Box>

          {/* Warden Contact */}
          <Box className="form-group">
            <Label className="form-label">Warden Contact Number</Label>
            <Input
              type="tel"
              placeholder="e.g. +91 98765 00000"
              value={details.wardenContact || ''}
              id="wardenContact"
              onChange={(e) => onChangeDetails('wardenContact', e.target.value)}
              className="form-input"
            />
          </Box>

          {/* Canteen Facility */}
          <Box className="form-group">
            <Label className="form-label">In-house Mess / Canteen?</Label>
            <Select
              className="form-select"
              value={details.canteenFacility !== undefined ? (details.canteenFacility ? 'Yes' : 'No') : 'Yes'}
              onChange={(e) => onChangeDetails('canteenFacility', e.target.value === 'Yes')}
            >
              <Option value="Yes">Yes (Mess / Canteen Available)</Option>
              <Option value="No">No Canteen</Option>
            </Select>
          </Box>

          {/* Security & Study Room */}
          <Box className="form-group">
            <Label className="form-label">24/7 Security CCTV & Warden?</Label>
            <Select
              className="form-select"
              value={details.securityCCTV !== undefined ? (details.securityCCTV ? 'Yes' : 'No') : 'Yes'}
              onChange={(e) => onChangeDetails('securityCCTV', e.target.value === 'Yes')}
            >
              <Option value="Yes">Yes (CCTV & Security Guard)</Option>
              <Option value="No">Basic Security</Option>
            </Select>
          </Box>
        </Box>
      )}

      {/* ==================== DORMITORY FORM ==================== */}
      {category === 'HOTEL' && (
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
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
        </Box>
      )}

      {/* ==================== BACHELOR ROOM FORM ==================== */}
      {/* Co-live is let as a whole property like a bachelor flat, and
          records the same facts — so it shares this block rather than
          duplicating it. */}
      {(category === 'BACHELOR' || category === 'COLIVE') && (
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
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
        </Box>
      )}

      {/* ==================== SHOP / COMMERCIAL FORM ==================== */}
      {/*
        Its own block, sharing nothing with the four above, because a
        commercial let has no overlap with them worth reusing. There are no
        layouts, no occupancy and no tenant rules — a shop is one unit let
        whole — and the facts that decide it are ones a residential form never
        asks: how big, which floor, and whether there is a washroom.

        The rent is NOT here. It is the ordinary monthly rent field in step 4,
        typed once, because a commercial unit has a single price rather than
        one per occupancy — see `validation.js`, where COMMERCIAL is kept off
        the derive-the-rent path for exactly that reason.
      */}
      {category === 'COMMERCIAL' && (
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          <Box className="form-group" style={{ gridColumn: '1 / -1' }}>
            <Label className="form-label">Suitable for *</Label>
            <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {COMMERCIAL_USES.map((use) => {
                const picked = Array.isArray(details.commercialUses) && details.commercialUses.includes(use);
                return (
                  <PlainButton
                    key={use}
                    type="button"
                    className={`btn ${picked ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '8px 14px', fontSize: '0.9rem' }}
                    onClick={() => handleCheckboxArray('commercialUses', use)}
                  >
                    {use}
                  </PlainButton>
                );
              })}
            </Box>
            <FieldError message={errors['categoryDetails.commercialUses']} />
          </Box>

          <Box className="form-group">
            <Label className="form-label">Built-up area (sq ft) *</Label>
            <Input
              type="number"
              className="form-input"
              min="1"
              placeholder="e.g. 450"
              value={details.builtUpArea || ''}
              onChange={(e) => onChangeDetails('builtUpArea', e.target.value)}
              style={{ borderColor: errorBorder(errors['categoryDetails.builtUpArea']) }}
            />
            <FieldError message={errors['categoryDetails.builtUpArea']} />
          </Box>

          <Box className="form-group">
            <Label className="form-label">Floor *</Label>
            <Select
              className="form-select"
              value={details.floor || ''}
              onChange={(e) => onChangeDetails('floor', e.target.value)}
              style={{ borderColor: errorBorder(errors['categoryDetails.floor']) }}
            >
              <Option value="">Select floor</Option>
              {COMMERCIAL_FLOORS.map((floor) => <Option key={floor} value={floor}>{floor}</Option>)}
            </Select>
            <FieldError message={errors['categoryDetails.floor']} />
          </Box>

          <Box className="form-group">
            <Label className="form-label">Condition</Label>
            <Select
              className="form-select"
              value={details.commercialFurnishing || 'Bare shell'}
              onChange={(e) => onChangeDetails('commercialFurnishing', e.target.value)}
            >
              {COMMERCIAL_FURNISHING.map((level) => <Option key={level} value={level}>{level}</Option>)}
            </Select>
          </Box>

          <Box className="form-group">
            <Label className="form-label">Washroom</Label>
            <Select
              className="form-select"
              value={details.washroom || 'Private washroom'}
              onChange={(e) => onChangeDetails('washroom', e.target.value)}
            >
              {COMMERCIAL_WASHROOM.map((option) => <Option key={option} value={option}>{option}</Option>)}
            </Select>
          </Box>

          <Box className="form-group">
            <Label className="form-label">Parking</Label>
            <Select
              className="form-select"
              value={details.parking || 'No parking'}
              onChange={(e) => onChangeDetails('parking', e.target.value)}
            >
              {COMMERCIAL_PARKING.map((option) => <Option key={option} value={option}>{option}</Option>)}
            </Select>
          </Box>

          <Box className="form-group" style={{ gridColumn: '1 / -1' }}>
            <Label className="form-label">Anything a tenant should know</Label>
            <TextArea
              className="form-input"
              rows={3}
              placeholder="e.g. corner unit facing the main road, 12 ft shutter, no cooking allowed, lift access closes at 8 PM"
              value={details.commercialNotes || ''}
              onChange={(e) => onChangeDetails('commercialNotes', e.target.value)}
            />
          </Box>
        </Box>
      )}
    </Box>
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
 * One document slot.
 *
 * Declared at MODULE scope, and that is the whole point. It used to live
 * inside `HotelDocuments`, which meant React saw a brand-new component type on
 * every render and threw the old subtree away — so the `<select>` inside it
 * was unmounted and remounted on every keystroke, and anything focused lost
 * focus after a single character.
 *
 * `docs` and `setDoc` therefore arrive as props rather than off the closure,
 * which is the only thing hoisting it costs.
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


/**
 * Per-layout/option photo picker — "1 BHK" gets its own set, "2 BHK" gets
 * its own, distinct from the whole-property gallery in
 * PricingAmenitiesStep. Optional: a layout with none falls back to that
 * shared gallery on the public site (see Backend's sharing.util.js).
 *
 * State: categoryDetails.localSharingImages = { [layoutId]: [{id, file,
 * previewUrl, name}, ...] } — mirrors PricingAmenitiesStep's `localImages`
 * item shape exactly (same createObjectURL/revokeObjectURL handling), one
 * array per label instead of one for the whole property. Uploaded in
 * App.jsx on submit via `uploadSharingImages`, then stripped before the
 * payload is sent — same treatment as `localImages`/`localDocuments`.
 */





/**
 * The amenity checklist for one furnishing level.
 *
 * Takes its value and its setter rather than reading `details`, because it is
 * rendered once per LAYOUT now — a house may let a semi-furnished 1 BHK and a
 * fully-furnished 2 BHK, and each carries its own list.
 */

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



