import React from 'react';
import { IndianRupee, Clock, Calendar, Check, Sparkles } from 'lucide-react';
import { PRESET_IMAGES } from '../../utils/presetImages';
import { ALL_AMENITIES } from '../../utils/allAmenities';
import { Box, Heading, Image, Inline, Input, Label, Option, PlainButton, Select } from '../../../common/atoms';



export function PricingAmenitiesStep({ formData, onChange, errors = {} }) {
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
    <Box className="animate-fade-in" style={{ marginBottom: '28px' }}>
      <Heading level={3} style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <IndianRupee size={20} color="#D8993E" />
        <Inline>3. Stay Duration, Pricing & Amenities</Inline>
      </Heading>

      {/* ==================================================== */}
      {/* STAY TYPE SELECTION (Short Stay 1-7 days / Long Stay 1+ month) */}
      {/* ==================================================== */}
      <Box style={{
        padding: '20px',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid var(--border-gold)',
        marginBottom: '20px'
      }}>
        <Label className="form-label" style={{ fontSize: '1rem', color: '#ffffff', marginBottom: '12px' }}>
          Are you looking for / Offering Stay Type *
        </Label>

        {/* 2 Main Stay Type Buttons (Short Stay vs Long Stay) */}
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          <PlainButton
            type="button"
            className={`btn ${isShortStay ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '12px 16px', fontSize: '0.9rem', background: isShortStay ? '#D8993E' : 'rgba(255,255,255,0.1)' }}
            onClick={() => setStayType('Short Stay')}
          >
            <Clock size={16} />
            <Inline>Short Stay (1-7 Days)</Inline>
          </PlainButton>

          <PlainButton
            type="button"
            className={`btn ${isLongStay ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '12px 16px', fontSize: '0.9rem', background: isLongStay ? '#D8993E' : 'rgba(255,255,255,0.1)' }}
            onClick={() => setStayType('Long Stay')}
          >
            <Calendar size={16} />
            <Inline>Long Stay (1+ Month)</Inline>
          </PlainButton>
        </Box>

        {/* Dynamic Fields for Short Stay (1-7 Days) */}
        {isShortStay && (
          <Box className="animate-fade-in" style={{
            padding: '16px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(216, 153, 62, 0.15)',
            border: '1px solid rgba(216, 153, 62, 0.35)'
          }}>
            <Heading level={4} style={{ fontSize: '0.92rem', color: '#f7c784', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={16} />
              <Inline>Short Stay Configuration (1 - 7 Days)</Inline>
            </Heading>

            <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <Box className="form-group" style={{ marginBottom: 0 }}>
                <Label className="form-label">Duration Option</Label>
                <Select
                  name="shortStayDuration"
                  className="form-select"
                  value={formData.shortStayDuration || '1-7 Days'}
                  onChange={onChange}
                >
                  <Option value="1 Day">1 Day</Option>
                  <Option value="2 Days">2 Days</Option>
                  <Option value="3 Days">3 Days</Option>
                  <Option value="4 Days">4 Days</Option>
                  <Option value="5 Days">5 Days</Option>
                  <Option value="6 Days">6 Days</Option>
                  <Option value="7 Days">7 Days (1 Week)</Option>
                  <Option value="1-7 Days">Flexible (1-7 Days)</Option>
                </Select>
              </Box>

              <Box className="form-group" style={{ marginBottom: 0 }}>
                <Label className="form-label">Price per Day (₹) *</Label>
                <Input
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
              </Box>
            </Box>
          </Box>
        )}

        {/* Dynamic Fields for Long Stay (Starting from 1 Month) */}
        {isLongStay && (
          <Box className="animate-fade-in" style={{
            padding: '16px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(42, 89, 62, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <Heading level={4} style={{ fontSize: '0.92rem', color: '#ffffff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={16} color="#D8993E" />
              <Inline>Long Stay Configuration (Starting from 1 Month)</Inline>
            </Heading>

            <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <Box className="form-group" style={{ marginBottom: 0 }}>
                <Label className="form-label">Minimum Duration</Label>
                <Select
                  name="longStayDuration"
                  className="form-select"
                  value={formData.longStayDuration || '1 Month+'}
                  onChange={onChange}
                >
                  <Option value="1 Month">1 Month</Option>
                  <Option value="3 Months">3 Months</Option>
                  <Option value="6 Months">6 Months</Option>
                  <Option value="1 Year">1 Year</Option>
                  <Option value="1 Month+">1 Month & Above</Option>
                </Select>
              </Box>

              <Box className="form-group" style={{ marginBottom: 0 }}>
                <Label className="form-label">Price per Month (₹) *</Label>
                <Input
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
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {/* Security Deposit */}
        <Box className="form-group">
          <Label className="form-label" htmlFor="depositInput">
            Security Deposit (₹)
          </Label>
          <Input
            id="depositInput"
            type="number"
            name="deposit"
            placeholder="e.g. 15000"
            value={formData.deposit || ''}
            onChange={onChange}
            className="form-input"
          />
        </Box>

        {/* Address */}
        <Box className="form-group" style={{ gridColumn: '1 / -1' }}>
          <Label className="form-label" htmlFor="addressInput">
            Complete Street Address
          </Label>
          <Input
            id="addressInput"
            type="text"
            name="address"
            placeholder="e.g. House No. 42, 1st Cross Road, Opp. Central Park"
            value={formData.address || ''}
            onChange={onChange}
            className="form-input"
          />
        </Box>

        {/* Image URL */}
        <Box className="form-group" style={{ gridColumn: '1 / -1' }}>
          <Label className="form-label">
            Property Image Photo URL
          </Label>
          <Input
            type="url"
            name="imageUrl"
            placeholder="https://images.unsplash.com/photo-..."
            value={formData.imageUrl || ''}
            onChange={onChange}
            className="form-input"
            style={{ marginBottom: '10px' }}
          />

          {/* Preset Image Suggestions */}
          <Box style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Inline style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Quick Select Presets:</Inline>
            {PRESET_IMAGES.map((img, i) => (
              <PlainButton
                key={i}
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '12px' }}
                onClick={() => onChange({ target: { name: 'imageUrl', value: img.url } })}
              >
                <Sparkles size={12} color="#D8993E" />
                {img.label}
              </PlainButton>
            ))}
          </Box>

          {/* Image Preview */}
          {formData.imageUrl && (
            <Box style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Image
                src={formData.imageUrl}
                alt="Property Preview"
                style={{ width: '90px', height: '60px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-glass)' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <Inline style={{ fontSize: '0.8rem', color: '#4ade80' }}>✓ Image preview ready</Inline>
            </Box>
          )}
        </Box>
      </Box>

      {/* Amenities Grid */}
      <Box className="form-group">
        <Label className="form-label" style={{ marginBottom: '12px' }}>
          Key Amenities Included
        </Label>
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
          {ALL_AMENITIES.map((amenity) => {
            const isChecked = selectedAmenities.includes(amenity);
            return (
              <Box
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
                <Box style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  background: isChecked ? '#D8993E' : 'rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {isChecked && <Check size={12} color="#ffffff" />}
                </Box>
                <Inline>{amenity}</Inline>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
