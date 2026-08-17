import React from 'react';
import { Building2, MapPin, User, Phone, UserCheck, Mail, MessageCircle } from 'lucide-react';
import FieldError, { errorBorder } from './FieldError.jsx';

export default function BasicDetailsStep({ formData, onChange, errors = {}, userEmail = '' }) {
  const activeEmployeeEmail = formData.employeeEmail || userEmail || '';

  return (
    <div className="animate-fade-in" style={{ marginBottom: '28px' }}>
      <h3 style={{ fontSize: '1.2rem', color: '#181e1b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Building2 size={20} color="#45855a" />
        <span>1. Basic Property & Owner Details</span>
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
        {/* Onboarded By Employee Email Field (Auto-populated from Login Session) */}
        <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: '4px' }}>
          <label className="form-label" htmlFor="employeeEmail" style={{ color: '#181e1b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserCheck size={16} color="#45855a" />
            <span>Onboarded By Employee Email *</span>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>(Auto-filled from Employee Login Session)</span>
          </label>
          <div style={{ position: 'relative' }}>
            <Mail size={16} color="#45855a" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              id="employeeEmail"
              type="email"
              name="employeeEmail"
              required
              placeholder="e.g. employee@lampose.com"
              value={activeEmployeeEmail}
              onChange={onChange}
              className="form-input"
              style={{
                paddingLeft: '38px',
                background: '#f8faf8',
                fontWeight: 600,
                color: '#181e1b',
                borderColor: errorBorder(errors.employeeEmail) || '#c2e2cc'
              }}
            />
          </div>
          <FieldError message={errors.employeeEmail} />
        </div>

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
              style={{ borderColor: errorBorder(errors.name) }}
            />
          </div>
          <FieldError message={errors.name} />
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
              style={{ borderColor: errorBorder(errors.place) }}
            />
          </div>
          <FieldError message={errors.place} />
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
              style={{ borderColor: errorBorder(errors.ownerName) }}
            />
          </div>
          <FieldError message={errors.ownerName} />
        </div>

        {/* Owner WhatsApp No — named for what it actually is. The onboarding
            approval message is sent here and the owner's YES has to come back
            from it, so a number without WhatsApp stalls the whole listing. */}
        <div className="form-group">
          <label className="form-label" htmlFor="ownerMobile">
            Owner WhatsApp Number *
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
              style={{ borderColor: errorBorder(errors.ownerMobile) }}
            />
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
            <MessageCircle size={13} color="#45855a" />
            <span>The verification message is sent to this number — it must be on WhatsApp.</span>
          </span>
          <FieldError message={errors.ownerMobile} />
        </div>

        {/* Owner Mobile No — optional call number, for owners whose WhatsApp
            sits on a different handset from the phone they actually answer. */}
        <div className="form-group">
          <label className="form-label" htmlFor="ownerAltMobile">
            Owner Mobile Number{' '}
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>(optional)</span>
          </label>
          <div style={{ position: 'relative' }}>
            <Phone size={15} color="#45855a" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              id="ownerAltMobile"
              type="tel"
              name="ownerAltMobile"
              placeholder="e.g. +91 90000 12345"
              value={formData.ownerAltMobile || ''}
              onChange={onChange}
              className="form-input"
              style={{ paddingLeft: '36px', borderColor: errorBorder(errors.ownerAltMobile) }}
            />
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
            A number to call the owner on. Leave blank if it is the same as the WhatsApp number.
          </span>
          <FieldError message={errors.ownerAltMobile} />
        </div>
      </div>
    </div>
  );
}
