import React from 'react';
import { Building2, MapPin, User, Phone } from 'lucide-react';
import { Box, Heading, Inline, Input, Label } from '../../../common/atoms';

export function BasicDetailsStep({ formData, onChange, errors = {} }) {
  return (
    <Box className="animate-fade-in" style={{ marginBottom: '28px' }}>
      <Heading level={3} style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Building2 size={20} color="var(--primary)" />
        <Inline>1. Basic Property & Owner Details</Inline>
      </Heading>

      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
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
              style={{ borderColor: errors.name ? '#f43f5e' : undefined }}
            />
          </Box>
          {errors.name && <Inline style={{ color: '#f43f5e', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{errors.name}</Inline>}
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
              style={{ borderColor: errors.place ? '#f43f5e' : undefined }}
            />
          </Box>
          {errors.place && <Inline style={{ color: '#f43f5e', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{errors.place}</Inline>}
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
              style={{ borderColor: errors.ownerName ? '#f43f5e' : undefined }}
            />
          </Box>
          {errors.ownerName && <Inline style={{ color: '#f43f5e', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{errors.ownerName}</Inline>}
        </Box>

        {/* Owner Mobile No */}
        <Box className="form-group">
          <Label className="form-label" htmlFor="ownerMobile">
            Owner Mobile Number *
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
              style={{ borderColor: errors.ownerMobile ? '#f43f5e' : undefined }}
            />
          </Box>
          {errors.ownerMobile && <Inline style={{ color: '#f43f5e', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{errors.ownerMobile}</Inline>}
        </Box>
      </Box>
    </Box>
  );
}
