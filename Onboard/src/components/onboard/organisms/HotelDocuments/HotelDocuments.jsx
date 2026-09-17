import React from 'react';
import { PREMISES_DOC_TYPES } from '../../utils/categoryFieldOptions';
import { Slot } from '../../molecules/Slot';
import { Box, Label, Option, Select, Text } from '../../../common/atoms';

export function HotelDocuments({ details, onChangeDetails, errors }) {
  const docs = details.localDocuments || {};

  const setDoc = (kind, patch) => {
    onChangeDetails('localDocuments', {
      ...docs,
      [kind]: patch === null ? undefined : { ...(docs[kind] || {}), ...patch },
    });
  };


  return (
    <Box className="form-group" style={{ gridColumn: '1 / -1' }} id="hotelDocuments">
      <Label className="form-label">Verification Documents *</Label>
      <Text style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px', lineHeight: 1.5 }}>
        A hotel takes money from strangers for a bed, so we ask it to show who is being paid and
        that they hold the premises. Both are required, and neither is shown on the public
        listing.
      </Text>

      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
        <Slot
          docs={docs}
          setDoc={setDoc}
          errors={errors}
          kind="pan"
          title="Owner / Business PAN"
          blurb="The PAN of the person or company that will be paid."
          errorKey="documents.pan"
        />

        <Slot
          docs={docs}
          setDoc={setDoc}
          errors={errors}
          kind="premises"
          title="Proof of Premises"
          blurb="Any one credible document establishing that this business holds this building."
          errorKey="documents.premises"
        >
          <Select
            className="form-select"
            value={docs.premises?.docType || ''}
            onChange={(e) => setDoc('premises', { docType: e.target.value })}
            style={{ padding: '8px 12px', fontSize: '0.85rem' }}
          >
            <Option value="">Which document is it?</Option>
            {PREMISES_DOC_TYPES.map((type) => (
              <Option key={type} value={type}>{type}</Option>
            ))}
          </Select>
        </Slot>
      </Box>
    </Box>
  );
}
