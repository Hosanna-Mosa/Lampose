import React from 'react';
import { useState } from 'react';
import { Pencil, Loader2, Save } from 'lucide-react';
import { editInputStyle } from '../../utils/editInputStyle';
import { Labelled } from '../../molecules/Labelled';
import { Box, Form, Heading, Inline, Input, PlainButton, Text } from '../../../common/atoms';

export function EditPropertyPanel({ property, saving, onCancel, onSave }) {
  const [form, setForm] = useState({
    name: property.name || '',
    place: property.place || '',
    address: property.address || '',
    ownerName: property.ownerName || '',
    ownerMobile: property.ownerMobile || '',
    ownerAltMobile: property.ownerAltMobile || '',
    monthlyPrice: property.monthlyPrice ?? '',
    dailyPrice: property.dailyPrice ?? '',
    deposit: property.deposit ?? '',
    // Rows onboarded before this field existed carry none — they open at 0.
    agreedSuccessCharge: property.agreedSuccessCharge ?? 0
  });

  const setField = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const monthlyPrice = Number(form.monthlyPrice) || 0;
    const dailyPrice = Number(form.dailyPrice) || 0;

    onSave({
      name: form.name.trim(),
      place: form.place.trim(),
      address: form.address.trim(),
      ownerName: form.ownerName.trim(),
      ownerMobile: form.ownerMobile.trim(),
      ownerAltMobile: form.ownerAltMobile.trim(),
      monthlyPrice,
      dailyPrice,
      deposit: Number(form.deposit) || 0,
      agreedSuccessCharge: Math.max(0, Number(form.agreedSuccessCharge) || 0),
      // `rent` is the field the listings and admin figures read, so it tracks
      // whichever price the listing is actually sold on.
      rent: monthlyPrice || dailyPrice || Number(property.rent) || 0
    });
  };

  return (
    <Box
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onCancel(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 14px',
        overflowY: 'auto'
      }}
      className="animate-fade-in"
    >
      <Form
        onSubmit={handleSubmit}
        style={{
          maxWidth: '560px',
          width: '100%',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e2e8f0',
          padding: '24px 22px',
          margin: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)'
        }}
      >
        <Heading level={3} style={{ fontSize: '1.15rem', fontWeight: 800, color: '#181e1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Pencil size={18} color="#45855a" />
          <Inline>Edit Listing</Inline>
        </Heading>
        <Text style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px', marginBottom: '18px' }}>
          Saving spends your approved edit permission — you will need a new approval for the next change.
        </Text>

        <Box style={{ display: 'grid', gap: '12px' }}>
          <Labelled label="Property Name">
            <Input value={form.name} onChange={setField('name')} required style={editInputStyle} />
          </Labelled>

          <Labelled label="Place / Location">
            <Input value={form.place} onChange={setField('place')} required style={editInputStyle} />
          </Labelled>

          <Labelled label="Street Address">
            <Input value={form.address} onChange={setField('address')} style={editInputStyle} />
          </Labelled>

          <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <Labelled label="Owner Name">
              <Input value={form.ownerName} onChange={setField('ownerName')} required style={editInputStyle} />
            </Labelled>
            <Labelled label="Owner WhatsApp">
              <Input value={form.ownerMobile} onChange={setField('ownerMobile')} required style={editInputStyle} />
            </Labelled>
            <Labelled label="Owner Mobile (optional)">
              <Input value={form.ownerAltMobile} onChange={setField('ownerAltMobile')} style={editInputStyle} />
            </Labelled>
          </Box>

          <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            <Labelled label="Monthly Price (₹)">
              <Input type="number" min="0" value={form.monthlyPrice} onChange={setField('monthlyPrice')} style={editInputStyle} />
            </Labelled>
            <Labelled label="Daily Price (₹)">
              <Input type="number" min="0" value={form.dailyPrice} onChange={setField('dailyPrice')} style={editInputStyle} />
            </Labelled>
            <Labelled label="Deposit (₹)">
              <Input type="number" min="0" value={form.deposit} onChange={setField('deposit')} style={editInputStyle} />
            </Labelled>
            <Labelled label="Agreed Success Charge (₹)">
              <Input type="number" min="0" value={form.agreedSuccessCharge} onChange={setField('agreedSuccessCharge')} style={editInputStyle} />
            </Labelled>
          </Box>
        </Box>

        <Box style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
          <PlainButton
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={{ padding: '10px 20px', borderRadius: '10px', background: '#ffffff', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}
          >
            Cancel
          </PlainButton>
          <PlainButton
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            style={{ padding: '10px 22px', background: '#45855a', borderRadius: '10px', fontSize: '0.88rem', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <Inline>{saving ? 'Saving…' : 'Save Changes'}</Inline>
          </PlainButton>
        </Box>
      </Form>
    </Box>
  );
}
