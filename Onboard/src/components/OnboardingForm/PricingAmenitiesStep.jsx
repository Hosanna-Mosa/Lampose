import React, { useState } from 'react';
import { IndianRupee, Clock, Calendar, Check, Sparkles, Upload, CloudUpload, AlertCircle, X, CheckCircle2, Plus, Star } from 'lucide-react';
import FieldError, { errorBorder } from './FieldError.jsx';

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
  'Elevator / Lift',
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

const DEFAULT_FALLBACK_SPLASH = '/lampose-logo-splash.png';

export default function PricingAmenitiesStep({ formData, onChange, errors = {} }) {
  const [customUrlInput, setCustomUrlInput] = useState('');
  /* Local to this control: the URL box is not part of the property until Add
     is pressed, so a bad link is answered here rather than at submit. */
  const [urlError, setUrlError] = useState('');

  const selectedAmenities = Array.isArray(formData.amenities) ? formData.amenities : [];
  const currentStayType = formData.stayType === 'Short Stay' ? 'Short Stay' : 'Long Stay';
  
  // Local images array representing photos chosen by user
  const localImages = Array.isArray(formData.localImages) ? formData.localImages : [];

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

  const isBachelor = formData.category === 'Bachelor Room';
  const isShortStay = currentStayType === 'Short Stay' && !isBachelor;
  const isLongStay = (currentStayType === 'Long Stay' || isBachelor) && !isShortStay;

  // Local File Selection (Does not upload to cloud until form submit)
  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    e.target.value = '';

    const newItems = fileList.map((file) => ({
      id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      file: file,
      previewUrl: URL.createObjectURL(file),
      name: file.name
    }));

    const updated = [...localImages, ...newItems];
    onChange({ target: { name: 'localImages', value: updated } });
  };

  const handleRemoveImage = (indexToRemove) => {
    const itemToRemove = localImages[indexToRemove];
    if (itemToRemove && itemToRemove.previewUrl && itemToRemove.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(itemToRemove.previewUrl);
    }
    const updated = localImages.filter((_, idx) => idx !== indexToRemove);
    onChange({ target: { name: 'localImages', value: updated } });
  };

  const handleSetCoverPhoto = (indexToSet) => {
    if (indexToSet === 0) return;
    const selected = localImages[indexToSet];
    const remaining = localImages.filter((_, idx) => idx !== indexToSet);
    const reordered = [selected, ...remaining];
    onChange({ target: { name: 'localImages', value: reordered } });
  };

  const handleAddCustomUrl = () => {
    const newUrl = customUrlInput.trim();
    if (!newUrl) {
      setUrlError('Paste a photo link first');
      return;
    }
    if (!/^https?:\/\/\S+$/i.test(newUrl)) {
      setUrlError('A photo link has to start with http:// or https://');
      return;
    }
    if (localImages.some(img => img.url === newUrl || img.previewUrl === newUrl)) {
      setUrlError('That photo is already in the list');
      return;
    }
    setUrlError('');
    const newItem = {
      id: 'url_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      url: newUrl,
      previewUrl: newUrl
    };
    const updated = [...localImages, newItem];
    onChange({ target: { name: 'localImages', value: updated } });
    setCustomUrlInput('');
  };

  const handleAddPreset = (url, label) => {
    if (localImages.some(img => img.url === url || img.previewUrl === url)) return;
    const newItem = {
      id: 'preset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      url: url,
      previewUrl: url,
      name: label
    };
    const updated = [...localImages, newItem];
    onChange({ target: { name: 'localImages', value: updated } });
  };

  return (
    <div className="animate-fade-in" style={{ marginBottom: '28px' }}>
      <h3 style={{ fontSize: '1.2rem', color: '#181e1b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <IndianRupee size={20} color="#45855a" />
        <span>{isBachelor ? '3. Pricing & Amenities' : '3. Stay Duration, Pricing & Amenities'}</span>
      </h3>

      {/* STAY TYPE SELECTION (For PG, Hostel, Dormitory) */}
      {!isBachelor ? (
        <div style={{
          padding: '20px',
          borderRadius: '16px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          marginBottom: '20px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
        }}>
          <label className="form-label" style={{ fontSize: '0.95rem', color: '#181e1b', fontWeight: 700, marginBottom: '14px' }}>
            Are you looking for / Offering Stay Type *
          </label>

          {/* 2 Main Stay Type Buttons (Short Stay vs Long Stay) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            <button
              type="button"
              className="btn"
              style={{
                padding: '12px 16px',
                fontSize: '0.9rem',
                fontWeight: 600,
                borderRadius: '12px',
                background: isShortStay ? '#45855a' : '#ffffff',
                color: isShortStay ? '#ffffff' : '#181e1b',
                border: isShortStay ? '1px solid #45855a' : '1px solid #cbd5e1',
                boxShadow: isShortStay ? '0 4px 14px rgba(69, 133, 90, 0.3)' : '0 2px 6px rgba(0,0,0,0.02)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
              onClick={() => setStayType('Short Stay')}
            >
              <Clock size={16} color={isShortStay ? '#ffffff' : '#45855a'} />
              <span>Short Stay (1-7 Days)</span>
            </button>

            <button
              type="button"
              className="btn"
              style={{
                padding: '12px 16px',
                fontSize: '0.9rem',
                fontWeight: 600,
                borderRadius: '12px',
                background: isLongStay ? '#45855a' : '#ffffff',
                color: isLongStay ? '#ffffff' : '#181e1b',
                border: isLongStay ? '1px solid #45855a' : '1px solid #cbd5e1',
                boxShadow: isLongStay ? '0 4px 14px rgba(69, 133, 90, 0.3)' : '0 2px 6px rgba(0,0,0,0.02)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
              onClick={() => setStayType('Long Stay')}
            >
              <Calendar size={16} color={isLongStay ? '#ffffff' : '#45855a'} />
              <span>Long Stay (1+ Month)</span>
            </button>
          </div>

          {/* Short Stay Configuration */}
          {isShortStay && (
            <div className="animate-fade-in" style={{
              padding: '16px',
              borderRadius: '12px',
              background: '#f0f7f2',
              border: '1px solid #c2e2cc'
            }}>
              <h4 style={{ fontSize: '0.92rem', color: '#181e1b', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={16} color="#45855a" />
                <span>Short Stay Configuration (1 - 7 Days)</span>
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ color: '#181e1b' }}>Duration Option</label>
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
                  <label className="form-label" htmlFor="dailyPriceInput" style={{ color: '#181e1b' }}>Price per Day (₹) *</label>
                  <input
                    id="dailyPriceInput"
                    type="number"
                    name="dailyPrice"
                    placeholder="e.g. 450.00"
                    value={formData.dailyPrice || ''}
                    onChange={(e) => {
                      onChange(e);
                      onChange({ target: { name: 'rent', value: e.target.value } });
                    }}
                    className="form-input"
                    style={{ borderColor: errorBorder(errors.dailyPrice) }}
                  />
                  <FieldError message={errors.dailyPrice} />
                </div>
              </div>
            </div>
          )}

          {/* Long Stay Configuration */}
          {isLongStay && (
            <div className="animate-fade-in" style={{
              padding: '16px',
              borderRadius: '12px',
              background: '#f0f7f2',
              border: '1px solid #c2e2cc'
            }}>
              <h4 style={{ fontSize: '0.92rem', color: '#181e1b', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={16} color="#45855a" />
                <span>Long Stay Configuration (Starting from 1 Month)</span>
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ color: '#181e1b' }}>Minimum Duration</label>
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
                  <label className="form-label" htmlFor="monthlyPriceInput" style={{ color: '#181e1b' }}>Price per Month (₹) *</label>
                  <input
                    id="monthlyPriceInput"
                    type="number"
                    name="monthlyPrice"
                    placeholder="e.g. 8500.00"
                    value={formData.monthlyPrice || ''}
                    onChange={(e) => {
                      onChange(e);
                      onChange({ target: { name: 'rent', value: e.target.value } });
                    }}
                    className="form-input"
                    style={{ borderColor: errorBorder(errors.monthlyPrice) }}
                  />
                  <FieldError message={errors.monthlyPrice} />
                  {formData.category === 'PG' && (
                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                      For a PG this fills itself from the cheapest sharing rent you enter above.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Direct Monthly Pricing Card for Bachelor Rooms */
        <div style={{
          padding: '20px',
          borderRadius: '16px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          marginBottom: '20px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
        }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="monthlyPriceInput" style={{ fontSize: '1rem', color: '#181e1b', fontWeight: 700, marginBottom: '8px' }}>
              Monthly Rent Amount (₹) *
            </label>
            <input
              id="monthlyPriceInput"
              type="number"
              name="monthlyPrice"
              placeholder="e.g. 12000.00"
              value={formData.monthlyPrice || formData.rent || ''}
              onChange={(e) => {
                onChange(e);
                onChange({ target: { name: 'rent', value: e.target.value } });
              }}
              className="form-input"
              style={{ borderColor: errorBorder(errors.monthlyPrice) }}
            />
            <FieldError message={errors.monthlyPrice} />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {/* Security Deposit */}
        <div className="form-group">
          <label className="form-label" htmlFor="depositInput" style={{ color: '#181e1b' }}>
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
            style={{ borderColor: errorBorder(errors.deposit) }}
          />
          <FieldError message={errors.deposit} />
        </div>

        {/* Address */}
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label className="form-label" htmlFor="addressInput" style={{ color: '#181e1b' }}>
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
            style={{ borderColor: errorBorder(errors.address) }}
          />
          <FieldError message={errors.address} />
        </div>

        {/* ==================================================== */}
        {/* MULTI-PHOTO SELECTION & GALLERY (UPLOADS ON SUBMIT) */}
        {/* ==================================================== */}
        <div id="propertyPhotos" className="form-group" style={{ gridColumn: '1 / -1' }}>
          <FieldError message={errors.photos} />
          <label className="form-label" style={{ color: '#181e1b', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CloudUpload size={18} color="#45855a" />
              <span>Property Photos ({localImages.length} Selected)</span>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>(Optional - Uploaded on Submit)</span>
            </span>
            <span style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600, background: '#eaf3ed', padding: '2px 8px', borderRadius: '10px' }}>
              ☁️ Auto Cloudinary Storage on Submit
            </span>
          </label>

          {/* Select Dropzone */}
          <div 
            style={{
              border: '2px dashed #c2e2cc',
              borderRadius: '16px',
              padding: '22px 16px',
              textAlign: 'center',
              background: '#f8faf8',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              marginBottom: '14px',
              position: 'relative'
            }}
            onClick={() => document.getElementById('cloudinaryMultiFileInput').click()}
          >
            <input
              id="cloudinaryMultiFileInput"
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: '#eaf3ed',
                color: '#45855a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Upload size={22} />
              </div>
              <div>
                <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#181e1b' }}>
                  Click to select photos or drag & drop images
                </span>
                <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                  Supports JPG, PNG, WEBP. Photos will be saved to Cloudinary when you submit the form.
                </p>
              </div>
            </div>
          </div>

          {/* Multi-Image Gallery Grid */}
          {localImages.length > 0 ? (
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: '10px',
                marginBottom: '10px'
              }}>
                {localImages.map((item, idx) => {
                  const isCover = idx === 0;
                  return (
                    <div
                      key={item.id || idx}
                      style={{
                        position: 'relative',
                        height: '110px',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        border: isCover ? '2px solid #45855a' : '1px solid #cbd5e1',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                        background: '#ffffff'
                      }}
                    >
                      <img
                        src={item.previewUrl || item.url || DEFAULT_FALLBACK_SPLASH}
                        alt={`Photo ${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.src = DEFAULT_FALLBACK_SPLASH; }}
                      />

                      {/* Cover Photo Badge / Set Cover Button */}
                      {isCover ? (
                        <div style={{
                          position: 'absolute',
                          top: '6px',
                          left: '6px',
                          background: '#45855a',
                          color: '#ffffff',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}>
                          <Star size={10} fill="#ffffff" />
                          <span>Cover</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetCoverPhoto(idx)}
                          style={{
                            position: 'absolute',
                            top: '6px',
                            left: '6px',
                            background: 'rgba(0,0,0,0.65)',
                            color: '#ffffff',
                            border: 'none',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                          title="Click to make this the primary cover photo"
                        >
                          Make Cover
                        </button>
                      )}

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          background: 'rgba(239, 68, 68, 0.9)',
                          color: '#ffffff',
                          border: 'none',
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                        }}
                        title="Remove this photo"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}

                {/* Add More Photos Box Inside Grid */}
                <div
                  onClick={() => document.getElementById('cloudinaryMultiFileInput').click()}
                  style={{
                    height: '110px',
                    borderRadius: '12px',
                    border: '2px dashed #c2e2cc',
                    background: '#f8faf8',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    color: '#45855a',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Plus size={22} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Add More</span>
                </div>
              </div>
            </div>
          ) : (
            /* Warning / Informational Fallback Notice */
            <div style={{
              padding: '12px 14px',
              borderRadius: '12px',
              background: '#f8faf8',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '14px'
            }}>
              <img
                src={DEFAULT_FALLBACK_SPLASH}
                alt="Lampose Splash Fallback"
                style={{ width: '64px', height: '44px', objectFit: 'contain', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#ffffff', flexShrink: 0 }}
              />
              <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: '1.4' }}>
                <span style={{ fontWeight: 600, color: '#181e1b', display: 'block' }}>
                  No photos selected (Optional)
                </span>
                <span>If you submit without photos, the default <strong>Lampose Brand Splash Photo</strong> will be used.</span>
              </div>
            </div>
          )}

          {/* Manual URL Input */}
          <div style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>
              Or add Photo by URL:
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="url"
                placeholder="Paste Image URL (https://...)"
                value={customUrlInput}
                onChange={(e) => { setCustomUrlInput(e.target.value); setUrlError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomUrl(); } }}
                className="form-input"
                style={{ flex: 1, borderColor: errorBorder(urlError) }}
              />
              <button
                type="button"
                onClick={handleAddCustomUrl}
                className="btn btn-secondary"
                style={{ padding: '0 16px', fontSize: '0.82rem', whiteSpace: 'nowrap', borderRadius: '10px' }}
              >
                Add URL
              </button>
            </div>
            <FieldError message={urlError} />
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Quick Select Presets:</span>
            {PRESET_IMAGES.map((img, i) => (
              <button
                key={i}
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '14px', background: '#ffffff', color: '#181e1b', border: '1px solid #cbd5e1' }}
                onClick={() => handleAddPreset(img.url, img.label)}
              >
                <Sparkles size={12} color="#45855a" />
                <span>+ {img.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Amenities Grid */}
      <div className="form-group">
        <label className="form-label" style={{ color: '#181e1b', fontWeight: 700, marginBottom: '12px' }}>
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
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: isChecked ? '#eaf3ed' : '#ffffff',
                  border: isChecked ? '1px solid #45855a' : '1px solid #e2e8f0',
                  color: isChecked ? '#181e1b' : '#475569',
                  fontWeight: isChecked ? 600 : 400,
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '4px',
                  background: isChecked ? '#45855a' : '#f1f5f2',
                  border: isChecked ? 'none' : '1px solid #cbd5e1',
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
