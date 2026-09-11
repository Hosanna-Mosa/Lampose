import React from 'react';
import { Building2, MapPin, User, Phone, UserCheck, Mail, MessageCircle } from 'lucide-react';
import { FieldError, errorBorder } from '../../atoms/FieldError/FieldError';
import { Box, Heading, Inline, Input, Label } from '../../../common/atoms';

export function BasicDetailsStep({ formData, onChange, errors = {}, userEmail = '' }) {
  const activeEmployeeEmail = formData.employeeEmail || userEmail || '';

  return (
    <Box className="animate-fade-in" style={{ marginBottom: '28px' }}>
      <Heading level={3} style={{ fontSize: '1.2rem', color: '#181e1b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Building2 size={20} color="#45855a" />
        <Inline>1. Basic Property & Owner Details</Inline>
      </Heading>

      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
        {/* Onboarded By Employee Email Field (Auto-populated from Login Session) */}
        <Box className="form-group" style={{ gridColumn: '1 / -1', marginBottom: '4px' }}>
          <Label className="form-label" htmlFor="employeeEmail" style={{ color: '#181e1b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserCheck size={16} color="#45855a" />
            <Inline>Onboarded By Employee Email *</Inline>
            <Inline style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>(Auto-filled from Employee Login Session)</Inline>
          </Label>
          <Box style={{ position: 'relative' }}>
            <Mail size={16} color="#45855a" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <Input
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
          </Box>
          <FieldError message={errors.employeeEmail} />
        </Box>

        {/* Property Name */}
        <Box className="form-group">
          <Label className="form-label" htmlFor="propertyName">
            Property / Accommodation Name *
          </Label>
          <Box style={{ position: 'relative' }}>
            <Input
              id="propertyName"
              type="text"
              name="name"
              placeholder="e.g. Sunrise Luxury PG & Residency"
              value={formData.name || ''}
              onChange={onChange}
              className="form-input"
              style={{ borderColor: errorBorder(errors.name) }}
            />
          </Box>
          <FieldError message={errors.name} />
        </Box>

        {/* Place / Location */}
        <Box className="form-group">
          <Label className="form-label" htmlFor="propertyPlace">
            Place / City / Area *
          </Label>
          <Box style={{ position: 'relative' }}>
            <Input
              id="propertyPlace"
              type="text"
              name="place"
              placeholder="e.g. Koramangala 5th Block, Bangalore"
              value={formData.place || ''}
              onChange={onChange}
              className="form-input"
              style={{ borderColor: errorBorder(errors.place) }}
            />
          </Box>
          <FieldError message={errors.place} />
        </Box>

        {/* Owner Name */}
        <Box className="form-group">
          <Label className="form-label" htmlFor="ownerName">
            Owner Full Name *
          </Label>
          <Box style={{ position: 'relative' }}>
            <Input
              id="ownerName"
              type="text"
              name="ownerName"
              placeholder="e.g. Rajesh Kumar"
              value={formData.ownerName || ''}
              onChange={onChange}
              className="form-input"
              style={{ borderColor: errorBorder(errors.ownerName) }}
            />
          </Box>
          <FieldError message={errors.ownerName} />
        </Box>

        {/* Owner WhatsApp No — named for what it actually is. The onboarding
            approval message is sent here and the owner's YES has to come back
            from it, so a number without WhatsApp stalls the whole listing. */}
        <Box className="form-group">
          <Label className="form-label" htmlFor="ownerMobile">
            Owner WhatsApp Number *
          </Label>
          <Box style={{ position: 'relative' }}>
            <Input
              id="ownerMobile"
              type="tel"
              name="ownerMobile"
              placeholder="e.g. +91 98765 43210"
              value={formData.ownerMobile || ''}
              onChange={onChange}
              className="form-input"
              style={{ borderColor: errorBorder(errors.ownerMobile) }}
            />
          </Box>
          <Inline style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
            <MessageCircle size={13} color="#45855a" />
            <Inline>The verification message is sent to this number — it must be on WhatsApp.</Inline>
          </Inline>
          <FieldError message={errors.ownerMobile} />
        </Box>

        {/* Owner Mobile No — optional call number, for owners whose WhatsApp
            sits on a different handset from the phone they actually answer. */}
        <Box className="form-group">
          <Label className="form-label" htmlFor="ownerAltMobile">
            Owner Mobile Number{' '}
            <Inline style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>(optional)</Inline>
          </Label>
          <Box style={{ position: 'relative' }}>
            <Phone size={15} color="#45855a" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <Input
              id="ownerAltMobile"
              type="tel"
              name="ownerAltMobile"
              placeholder="e.g. +91 90000 12345"
              value={formData.ownerAltMobile || ''}
              onChange={onChange}
              className="form-input"
              style={{ paddingLeft: '36px', borderColor: errorBorder(errors.ownerAltMobile) }}
            />
          </Box>
          <Inline style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
            A number to call the owner on. Leave blank if it is the same as the WhatsApp number.
          </Inline>
          <FieldError message={errors.ownerAltMobile} />
        </Box>
      </Box>
    </Box>
  );
}
