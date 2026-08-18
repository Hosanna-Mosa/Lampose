import React from 'react';
import { Utensils, ShieldCheck, Bed, Key, Check, Snowflake } from 'lucide-react';

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
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Sharing Options Available</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {['Single', '2 Sharing', '3 Sharing', '4 Sharing', 'Dorm Sharing'].map((type) => {
                const isSelected = Array.isArray(details.sharingTypes) && details.sharingTypes.includes(type);
                return (
                  <div
                    key={type}
                    onClick={() => handleCheckboxArray('sharingTypes', type)}
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
                    {isSelected && <Check size={14} />}
                    <span>{type}</span>
                  </div>
                );
              })}
            </div>

            {/* Sharing Prices (Dynamic based on selected sharing types) */}
            {Array.isArray(details.sharingTypes) && details.sharingTypes.length > 0 && (
              <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(0, 0, 0, 0.02)', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                <label className="form-label" style={{ fontSize: '0.85rem', color: '#181e1b', fontWeight: 700, marginBottom: '10px' }}>
                  Monthly Price for Selected Sharing Options (₹):
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  {details.sharingTypes.map((type) => {
                    const currentPrice = details.sharingPrices ? details.sharingPrices[type] : '';
                    const hasAC = !!(details.sharingAC && details.sharingAC[type]);
                    const acPrice = details.sharingAcPrices ? details.sharingAcPrices[type] : '';

                    /* How many of this room type exist, and therefore how many
                       beds. This is the number the app claims against when an
                       owner accepts a request — without it the option cannot
                       be requested at all, which is why it is marked required
                       rather than left to be filled in later. */
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
                          type="number"
                          min="0"
                          placeholder="e.g. 6000"
                          value={currentPrice || ''}
                          onChange={(e) => setMapValue('sharingPrices', type, Number(e.target.value) || '')}
                          className="form-input"
                          style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                        />

                        {/* ── How many rooms, and therefore how many beds ──────
                            The agent counts rooms because that is what they are
                            standing in front of; the app needs beds, so the two
                            are multiplied out and both are stored. A label that
                            does not say how many share a room ("Dorm Sharing")
                            gets asked for beds directly. */}
                        {occupancy ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                              How many {type} rooms? *
                            </span>
                            <input
                              type="number"
                              min="0"
                              placeholder="e.g. 3"
                              value={rooms || ''}
                              onChange={(e) => {
                                const count = Number(e.target.value) || '';
                                setMapValue('sharingRooms', type, count);
                                /* Beds are written too, not just derived on
                                   read — the backend accepts either, and an
                                   explicit number survives somebody later
                                   renaming the sharing label. */
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
