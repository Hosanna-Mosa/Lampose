import React from 'react';
import { Utensils, ShieldCheck, Bed, Key, Check } from 'lucide-react';
import { Box, Heading, Inline, Input, Label, Option, PlainButton, Select } from '../../../common/atoms';

export function CategoryFieldsStep({ category, details = {}, onChangeDetails }) {
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
    <Box className="animate-fade-in" style={{
      marginBottom: '28px',
      padding: '24px',
      background: 'rgba(15, 23, 42, 0.4)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-glass)'
    }}>
      <Heading level={3} style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Inline className={`badge ${
          category === 'PG' ? 'badge-pg' :
          category === 'Hostel' ? 'badge-hostel' :
          category === 'Dormitory' ? 'badge-dormitory' : 'badge-bachelor'
        }`}>
          {category}
        </Inline>
        <Inline>Category Specific Details ({category})</Inline>
      </Heading>

      {/* ==================== PG FORM ==================== */}
      {category === 'PG' && (
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

          {/* Sharing Types */}
          <Box className="form-group" style={{ gridColumn: '1 / -1' }}>
            <Label className="form-label">Sharing Options Available</Label>
            <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {['Single', '2 Sharing', '3 Sharing', '4 Sharing', 'Dorm Sharing'].map((type) => {
                const isSelected = Array.isArray(details.sharingTypes) && details.sharingTypes.includes(type);
                return (
                  <Box
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
                    <Inline>{type}</Inline>
                  </Box>
                );
              })}
            </Box>
          </Box>

          {/* AC Available */}
          <Box className="form-group">
            <Label className="form-label">AC Rooms Available?</Label>
            <Select
              className="form-select"
              value={details.acAvailable !== undefined ? (details.acAvailable ? 'Yes' : 'No') : 'Yes'}
              onChange={(e) => onChangeDetails('acAvailable', e.target.value === 'Yes')}
            >
              <Option value="Yes">Yes (AC Available)</Option>
              <Option value="No">No (Non-AC Only)</Option>
            </Select>
          </Box>

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
      {category === 'Hostel' && (
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          {/* Hostel Type */}
          <Box className="form-group">
            <Label className="form-label">Hostel Type *</Label>
            <Select
              className="form-select"
              value={details.hostelType || 'Boys Hostel'}
              onChange={(e) => onChangeDetails('hostelType', e.target.value)}
            >
              <Option value="Boys Hostel">Boys Hostel</Option>
              <Option value="Girls Hostel">Girls Hostel</Option>
              <Option value="Co-ed Hostel">Co-ed Hostel</Option>
            </Select>
          </Box>

          {/* Warden Contact */}
          <Box className="form-group">
            <Label className="form-label">Warden Contact Number</Label>
            <Input
              type="tel"
              placeholder="e.g. +91 98765 00000"
              value={details.wardenContact || ''}
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
      {category === 'Dormitory' && (
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          {/* Total Beds */}
          <Box className="form-group">
            <Label className="form-label">Total Beds Available</Label>
            <Input
              type="number"
              placeholder="e.g. 24"
              value={details.totalBeds || ''}
              onChange={(e) => onChangeDetails('totalBeds', Number(e.target.value))}
              className="form-input"
            />
          </Box>

          {/* Rate Type */}
          <Box className="form-group">
            <Label className="form-label">Pricing Structure</Label>
            <Select
              className="form-select"
              value={details.rateType || 'Daily Rate'}
              onChange={(e) => onChangeDetails('rateType', e.target.value)}
            >
              <Option value="Daily Rate">Daily Rate (Per Bed/Night)</Option>
              <Option value="Monthly Rate">Monthly Subscription</Option>
              <Option value="Flexible (Hourly/Daily)">Flexible (Hourly/Daily)</Option>
            </Select>
          </Box>

          {/* Bed Type */}
          <Box className="form-group">
            <Label className="form-label">Bed Format</Label>
            <Select
              className="form-select"
              value={details.bedType || 'Bunk Bed Pod'}
              onChange={(e) => onChangeDetails('bedType', e.target.value)}
            >
              <Option value="Bunk Bed Pod">Bunk Bed Pod</Option>
              <Option value="Single Metal Bed">Single Metal Bed</Option>
              <Option value="Capsule Luxury Pod">Capsule Luxury Pod</Option>
            </Select>
          </Box>

          {/* Washrooms Count */}
          <Box className="form-group">
            <Label className="form-label">Shared Washrooms Count</Label>
            <Input
              type="number"
              placeholder="e.g. 6"
              value={details.washroomsCount || ''}
              onChange={(e) => onChangeDetails('washroomsCount', Number(e.target.value))}
              className="form-input"
            />
          </Box>
        </Box>
      )}

      {/* ==================== BACHELOR ROOM FORM ==================== */}
      {category === 'Bachelor Room' && (
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          {/* Room Type */}
          <Box className="form-group">
            <Label className="form-label">Room / Flat Layout *</Label>
            <Select
              className="form-select"
              value={details.roomType || '1 BHK'}
              onChange={(e) => onChangeDetails('roomType', e.target.value)}
            >
              <Option value="Single Private Room">Single Private Room</Option>
              <Option value="1 RK">1 RK (Room Kitchen)</Option>
              <Option value="1 BHK">1 BHK Apartment</Option>
              <Option value="2 BHK">2 BHK Apartment</Option>
              <Option value="3 BHK">3 BHK Apartment</Option>
            </Select>
          </Box>

          {/* Furnishing Status */}
          <Box className="form-group">
            <Label className="form-label">Furnishing Status</Label>
            <Select
              className="form-select"
              value={details.furnishing || 'Semi-Furnished'}
              onChange={(e) => onChangeDetails('furnishing', e.target.value)}
            >
              <Option value="Fully Furnished">Fully Furnished</Option>
              <Option value="Semi-Furnished">Semi-Furnished</Option>
              <Option value="Unfurnished">Unfurnished</Option>
            </Select>
          </Box>

          {/* Allowed Tenants */}
          <Box className="form-group">
            <Label className="form-label">Allowed Tenants</Label>
            <Select
              className="form-select"
              value={details.allowedTenants || 'Bachelors Male / Female'}
              onChange={(e) => onChangeDetails('allowedTenants', e.target.value)}
            >
              <Option value="Bachelors Male / Female">Bachelors Male / Female</Option>
              <Option value="Bachelors Male Only">Bachelors Male Only</Option>
              <Option value="Bachelors Female Only">Bachelors Female Only</Option>
            </Select>
          </Box>

          {/* Kitchen Available */}
          <Box className="form-group">
            <Label className="form-label">Kitchen / Cooking Provision?</Label>
            <Select
              className="form-select"
              value={details.kitchenAvailable !== undefined ? (details.kitchenAvailable ? 'Yes' : 'No') : 'Yes'}
              onChange={(e) => onChangeDetails('kitchenAvailable', e.target.value === 'Yes')}
            >
              <Option value="Yes">Yes (Kitchen & Cooking Allowed)</Option>
              <Option value="No">No Kitchen Setup</Option>
            </Select>
          </Box>
        </Box>
      )}
    </Box>
  );
}
