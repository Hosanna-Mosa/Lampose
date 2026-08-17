import React from 'react';
import { Building2, MapPin, User, Phone } from 'lucide-react';

export default function BasicDetailsStep({ formData, onChange, errors = {} }) {
  return (
    <div className="animate-fade-in" style={{ marginBottom: '28px' }}>
      <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Building2 size={20} color="var(--primary)" />
        <span>1. Basic Property & Owner Details</span>
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
        {/* Property Name */}
        <div className="form-group">
          <label className="form-label" htmlFor="propertyName">
            Property / Accommodation Name *
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="propertyName"
              type="text"
              name="name"
              placeholder="e.g. Sunrise Luxury PG & Residency"
              value={formData.name || ''}
              onChange={onChange}
              className="form-input"
              style={{ borderColor: errors.name ? '#f43f5e' : undefined }}
            />
          </div>
          {errors.name && <span style={{ color: '#f43f5e', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{errors.name}</span>}
        </div>

        {/* Place / Location */}
        <div className="form-group">
          <label className="form-label" htmlFor="propertyPlace">
            Place / City / Area *
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="propertyPlace"
              type="text"
              name="place"
              placeholder="e.g. Koramangala 5th Block, Bangalore"
              value={formData.place || ''}
              onChange={onChange}
              className="form-input"
              style={{ borderColor: errors.place ? '#f43f5e' : undefined }}
            />
          </div>
          {errors.place && <span style={{ color: '#f43f5e', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{errors.place}</span>}
        </div>

        {/* Owner Name */}
        <div className="form-group">
          <label className="form-label" htmlFor="ownerName">
            Owner Full Name *
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="ownerName"
              type="text"
              name="ownerName"
              placeholder="e.g. Rajesh Kumar"
              value={formData.ownerName || ''}
              onChange={onChange}
              className="form-input"
              style={{ borderColor: errors.ownerName ? '#f43f5e' : undefined }}
            />
          </div>
          {errors.ownerName && <span style={{ color: '#f43f5e', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{errors.ownerName}</span>}
        </div>

        {/* Owner Mobile No */}
        <div className="form-group">
          <label className="form-label" htmlFor="ownerMobile">
            Owner Mobile Number *
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="ownerMobile"
              type="tel"
              name="ownerMobile"
              placeholder="e.g. +91 98765 43210"
              value={formData.ownerMobile || ''}
              onChange={onChange}
              className="form-input"
              style={{ borderColor: errors.ownerMobile ? '#f43f5e' : undefined }}
            />
          </div>
          {errors.ownerMobile && <span style={{ color: '#f43f5e', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{errors.ownerMobile}</span>}
        </div>
      </div>
    </div>
  );
}
