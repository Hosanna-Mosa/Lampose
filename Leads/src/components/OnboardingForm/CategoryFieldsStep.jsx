import React from 'react';
import { Utensils, ShieldCheck, Bed, Key, Check } from 'lucide-react';

export default function CategoryFieldsStep({ category, details = {}, onChangeDetails }) {
  if (!category) return null;

  const handleToggle = (field, value) => {
    onChangeDetails(field, value);
  };

  const handleCheckboxArray = (field, item) => {
    const currentArray = Array.isArray(details[field]) ? details[field] : [];
    const updated = currentArray.includes(item)
      ? currentArray.filter(i => i !== item)
      : [...currentArray, item];
    onChangeDetails(field, updated);
  };

  return (
    <div className="animate-fade-in" style={{
      marginBottom: '28px',
      padding: '24px',
      background: 'rgba(15, 23, 42, 0.4)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-glass)'
    }}>
      <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          </div>

          {/* AC Available */}
          <div className="form-group">
            <label className="form-label">AC Rooms Available?</label>
            <select
              className="form-select"
              value={details.acAvailable !== undefined ? (details.acAvailable ? 'Yes' : 'No') : 'Yes'}
              onChange={(e) => onChangeDetails('acAvailable', e.target.value === 'Yes')}
            >
              <option value="Yes">Yes (AC Available)</option>
              <option value="No">No (Non-AC Only)</option>
            </select>
          </div>

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
