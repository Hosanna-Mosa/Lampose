import React from 'react';
import { IndianRupee, Clock, Calendar, Check, Sparkles } from 'lucide-react';

const PRESET_IMAGES = [
  { label: 'Cozy Room', url: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80' },
  { label: 'Modern Studio', url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80' },
  { label: 'Hostel Room', url: 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80' },
  { label: 'Pod Dormitory', url: 'https://images.unsplash.com/photo-1520277739336-7bf67edfa768?auto=format&fit=crop&w=800&q=80' },
  { label: 'Bachelor Flat', url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80' }
];

const ALL_AMENITIES = [
  'WiFi',
  'AC',
  'Food',
  'TV',
  'Housekeeping',
  'Power Backup',
  'RO Water',
  'Washing Machine',
  'CCTV Security',
  'Covered Parking',
  'Gym',
  'Personal Lockers',
  'Kitchen Setup'
];

export default function PricingAmenitiesStep({ formData, onChange, errors = {} }) {
  const selectedAmenities = Array.isArray(formData.amenities) ? formData.amenities : [];
  const currentStayType = formData.stayType === 'Short Stay' ? 'Short Stay' : 'Long Stay';

  const toggleAmenity = (amenity) => {
    const updated = selectedAmenities.includes(amenity)
      ? selectedAmenities.filter(a => a !== amenity)
      : [...selectedAmenities, amenity];
    
    onChange({
      target: {
        name: 'amenities',
        value: updated
      }
    });
  };

  const setStayType = (type) => {
    onChange({ target: { name: 'stayType', value: type } });
  };

  const isShortStay = currentStayType === 'Short Stay';
  const isLongStay = currentStayType === 'Long Stay';

  return (
    <div className="animate-fade-in" style={{ marginBottom: '28px' }}>
      <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <IndianRupee size={20} color="#D8993E" />
        <span>3. Stay Duration, Pricing & Amenities</span>
      </h3>

      {/* ==================================================== */}
      {/* STAY TYPE SELECTION (Short Stay 1-7 days / Long Stay 1+ month) */}
      {/* ==================================================== */}
      <div style={{
        padding: '20px',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid var(--border-gold)',
        marginBottom: '20px'
      }}>
        <label className="form-label" style={{ fontSize: '1rem', color: '#ffffff', marginBottom: '12px' }}>
          Are you looking for / Offering Stay Type *
        </label>

        {/* 2 Main Stay Type Buttons (Short Stay vs Long Stay) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          <button
            type="button"
            className={`btn ${isShortStay ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '12px 16px', fontSize: '0.9rem', background: isShortStay ? '#D8993E' : 'rgba(255,255,255,0.1)' }}
            onClick={() => setStayType('Short Stay')}
          >
            <Clock size={16} />
            <span>Short Stay (1-7 Days)</span>
          </button>

          <button
            type="button"
            className={`btn ${isLongStay ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '12px 16px', fontSize: '0.9rem', background: isLongStay ? '#D8993E' : 'rgba(255,255,255,0.1)' }}
            onClick={() => setStayType('Long Stay')}
          >
            <Calendar size={16} />
            <span>Long Stay (1+ Month)</span>
          </button>
        </div>

        {/* Dynamic Fields for Short Stay (1-7 Days) */}
        {isShortStay && (
          <div className="animate-fade-in" style={{
            padding: '16px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(216, 153, 62, 0.15)',
            border: '1px solid rgba(216, 153, 62, 0.35)'
          }}>
            <h4 style={{ fontSize: '0.92rem', color: '#f7c784', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={16} />
              <span>Short Stay Configuration (1 - 7 Days)</span>
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Duration Option</label>
                <select
                  name="shortStayDuration"
                  className="form-select"
                  value={formData.shortStayDuration || '1-7 Days'}
                  onChange={onChange}
                >
                  <option value="1 Day">1 Day</option>
                  <option value="2 Days">2 Days</option>
                  <option value="3 Days">3 Days</option>
                  <option value="4 Days">4 Days</option>
                  <option value="5 Days">5 Days</option>
                  <option value="6 Days">6 Days</option>
                  <option value="7 Days">7 Days (1 Week)</option>
                  <option value="1-7 Days">Flexible (1-7 Days)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Price per Day (₹) *</label>
                <input
                  type="number"
                  name="dailyPrice"
                  placeholder="e.g. 450.00"
                  value={formData.dailyPrice || ''}
                  onChange={(e) => {
                    onChange(e);
                    onChange({ target: { name: 'rent', value: e.target.value } });
                  }}
                  className="form-input"
                />
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Fields for Long Stay (Starting from 1 Month) */}
        {isLongStay && (
          <div className="animate-fade-in" style={{
            padding: '16px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(42, 89, 62, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <h4 style={{ fontSize: '0.92rem', color: '#ffffff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={16} color="#D8993E" />
              <span>Long Stay Configuration (Starting from 1 Month)</span>
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Minimum Duration</label>
                <select
                  name="longStayDuration"
                  className="form-select"
                  value={formData.longStayDuration || '1 Month+'}
                  onChange={onChange}
                >
                  <option value="1 Month">1 Month</option>
                  <option value="3 Months">3 Months</option>
                  <option value="6 Months">6 Months</option>
                  <option value="1 Year">1 Year</option>
                  <option value="1 Month+">1 Month & Above</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Price per Month (₹) *</label>
                <input
                  type="number"
                  name="monthlyPrice"
                  placeholder="e.g. 8500.00"
                  value={formData.monthlyPrice || ''}
                  onChange={(e) => {
                    onChange(e);
                    onChange({ target: { name: 'rent', value: e.target.value } });
                  }}
                  className="form-input"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {/* Security Deposit */}
        <div className="form-group">
          <label className="form-label" htmlFor="depositInput">
            Security Deposit (₹)
          </label>
          <input
            id="depositInput"
            type="number"
            name="deposit"
            placeholder="e.g. 15000"
            value={formData.deposit || ''}
            onChange={onChange}
            className="form-input"
          />
        </div>

        {/* Address */}
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label className="form-label" htmlFor="addressInput">
            Complete Street Address
          </label>
          <input
            id="addressInput"
            type="text"
            name="address"
            placeholder="e.g. House No. 42, 1st Cross Road, Opp. Central Park"
            value={formData.address || ''}
            onChange={onChange}
            className="form-input"
          />
        </div>

        {/* Image URL */}
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">
            Property Image Photo URL
          </label>
          <input
            type="url"
            name="imageUrl"
            placeholder="https://images.unsplash.com/photo-..."
            value={formData.imageUrl || ''}
            onChange={onChange}
            className="form-input"
            style={{ marginBottom: '10px' }}
          />

          {/* Preset Image Suggestions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Quick Select Presets:</span>
            {PRESET_IMAGES.map((img, i) => (
              <button
                key={i}
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '12px' }}
                onClick={() => onChange({ target: { name: 'imageUrl', value: img.url } })}
              >
                <Sparkles size={12} color="#D8993E" />
                {img.label}
              </button>
            ))}
          </div>

          {/* Image Preview */}
          {formData.imageUrl && (
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img
                src={formData.imageUrl}
                alt="Property Preview"
                style={{ width: '90px', height: '60px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-glass)' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <span style={{ fontSize: '0.8rem', color: '#4ade80' }}>✓ Image preview ready</span>
            </div>
          )}
        </div>
      </div>

      {/* Amenities Grid */}
      <div className="form-group">
        <label className="form-label" style={{ marginBottom: '12px' }}>
          Key Amenities Included
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
          {ALL_AMENITIES.map((amenity) => {
            const isChecked = selectedAmenities.includes(amenity);
            return (
              <div
                key={amenity}
                onClick={() => toggleAmenity(amenity)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: isChecked ? 'rgba(216, 153, 62, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: isChecked ? '1px solid #D8993E' : '1px solid var(--border-glass)',
                  color: isChecked ? '#ffffff' : 'var(--text-sub)',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  background: isChecked ? '#D8993E' : 'rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {isChecked && <Check size={12} color="#ffffff" />}
                </div>
                <span>{amenity}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
