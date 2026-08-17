import React, { useState } from 'react';
import { Utensils, ShieldCheck, Bed, Key, Check, Snowflake, Plus, X } from 'lucide-react';

const MEAL_OPTIONS = ['Breakfast', 'Lunch', 'Dinner'];

/* The occupancies most properties are laid out in. Anything else is added
   through "Custom" and recorded in `customSharingTypes` — see SharingOptions
   at the bottom of this file. */
const BASE_SHARING_TYPES = ['Single', '2 Sharing', '3 Sharing', '4 Sharing'];

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
  sharingTypes: ['sharingPrices', 'sharingAC', 'sharingAcPrices'],
  mealsProvided: ['mealTimings']
};

export default function CategoryFieldsStep({ category, details = {}, onChangeDetails }) {
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
        <span className={`badge ${
          category === 'PG' ? 'badge-pg' :
          category === 'Hostel' ? 'badge-hostel' :
          category === 'Dormitory' ? 'badge-dormitory' : 'badge-bachelor'
        }`}>
          {category}
        </span>
        <span>Category Specific Details ({category})</span>
      </h3>

      {/* ==================== PG FORM ==================== */}
      {category === 'PG' && (
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
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Meals Provided</label>
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
      {category === 'Hostel' && (
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
      {category === 'Dormitory' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          {/* Total Beds */}
          <div className="form-group">
            <label className="form-label">Total Beds Available</label>
            <input
              type="number"
              placeholder="e.g. 24"
              value={details.totalBeds || ''}
              onChange={(e) => onChangeDetails('totalBeds', Number(e.target.value))}
              className="form-input"
            />
          </div>

          {/* Rate Type */}
          <div className="form-group">
            <label className="form-label">Pricing Structure</label>
            <select
              className="form-select"
              value={details.rateType || 'Daily Rate'}
              onChange={(e) => onChangeDetails('rateType', e.target.value)}
            >
              <option value="Daily Rate">Daily Rate (Per Bed/Night)</option>
              <option value="Monthly Rate">Monthly Subscription</option>
              <option value="Flexible (Hourly/Daily)">Flexible (Hourly/Daily)</option>
            </select>
          </div>

          {/* Bed Type */}
          <div className="form-group">
            <label className="form-label">Bed Format</label>
            <select
              className="form-select"
              value={details.bedType || 'Bunk Bed Pod'}
              onChange={(e) => onChangeDetails('bedType', e.target.value)}
            >
              <option value="Bunk Bed Pod">Bunk Bed Pod</option>
              <option value="Single Metal Bed">Single Metal Bed</option>
              <option value="Capsule Luxury Pod">Capsule Luxury Pod</option>
            </select>
          </div>

          {/* Washrooms Count */}
          <div className="form-group">
            <label className="form-label">Shared Washrooms Count</label>
            <input
              type="number"
              placeholder="e.g. 6"
              value={details.washroomsCount || ''}
              onChange={(e) => onChangeDetails('washroomsCount', Number(e.target.value))}
              className="form-input"
            />
          </div>
        </div>
      )}

      {/* ==================== BACHELOR ROOM FORM ==================== */}
      {category === 'Bachelor Room' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          {/* Room Type */}
          <div className="form-group">
            <label className="form-label">Room / Flat Layout *</label>
            <select
              className="form-select"
              value={details.roomType || '1 BHK'}
              onChange={(e) => onChangeDetails('roomType', e.target.value)}
            >
              <option value="Single Private Room">Single Private Room</option>
              <option value="1 RK">1 RK (Room Kitchen)</option>
              <option value="1 BHK">1 BHK Apartment</option>
              <option value="2 BHK">2 BHK Apartment</option>
              <option value="3 BHK">3 BHK Apartment</option>
            </select>
          </div>

          {/* Furnishing Status */}
          <div className="form-group">
            <label className="form-label">Furnishing Status</label>
            <select
              className="form-select"
              value={details.furnishing || 'Semi-Furnished'}
              onChange={(e) => onChangeDetails('furnishing', e.target.value)}
            >
              <option value="Fully Furnished">Fully Furnished</option>
              <option value="Semi-Furnished">Semi-Furnished</option>
              <option value="Unfurnished">Unfurnished</option>
            </select>
          </div>

          {/* Allowed Tenants */}
          <div className="form-group">
            <label className="form-label">Allowed Tenants</label>
            <select
              className="form-select"
              value={details.allowedTenants || 'Bachelors Male / Female'}
              onChange={(e) => onChangeDetails('allowedTenants', e.target.value)}
            >
              <option value="Bachelors Male / Female">Bachelors Male / Female</option>
              <option value="Bachelors Male Only">Bachelors Male Only</option>
              <option value="Bachelors Female Only">Bachelors Female Only</option>
            </select>
          </div>

          {/* Kitchen Available */}
          <div className="form-group">
            <label className="form-label">Kitchen / Cooking Provision?</label>
            <select
              className="form-select"
              value={details.kitchenAvailable !== undefined ? (details.kitchenAvailable ? 'Yes' : 'No') : 'Yes'}
              onChange={(e) => onChangeDetails('kitchenAvailable', e.target.value === 'Yes')}
            >
              <option value="Yes">Yes (Kitchen & Cooking Allowed)</option>
              <option value="No">No Kitchen Setup</option>
            </select>
          </div>
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
function SharingOptions({ details, onChangeDetails, onToggleType, setMapValue }) {
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
    ['sharingPrices', 'sharingAC', 'sharingAcPrices'].forEach((mapField) => {
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
    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
      <label className="form-label">Sharing Options Available</label>
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
                    type="number"
                    min="0"
                    placeholder="e.g. 6000"
                    value={currentPrice || ''}
                    onChange={(e) => setMapValue('sharingPrices', type, Number(e.target.value) || '')}
                    className="form-input"
                    style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                  />

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
                      <span style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>{type} AC Rent (₹)</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 8000"
                        value={acPrice || ''}
                        onChange={(e) => setMapValue('sharingAcPrices', type, Number(e.target.value) || '')}
                        className="form-input"
                        style={{ padding: '8px 12px', fontSize: '0.85rem', borderColor: '#c2e2cc' }}
                      />
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
