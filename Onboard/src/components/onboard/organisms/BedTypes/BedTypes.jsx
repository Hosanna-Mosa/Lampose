import React from 'react';
import { BED_TYPES, RATE_STRUCTURES } from '../../utils/categoryFieldOptions';
import { Bed, Snowflake } from 'lucide-react';
import { errorBorder, FieldError } from '../../atoms/FieldError/FieldError';
import { roomCountKey, sharingPriceKey, sharingAcPriceKey } from '../../../../services/validation.js';
import { ChipPicker } from '../../molecules/ChipPicker';
import { LayoutPhotos } from '../LayoutPhotos';
import { Box, Inline, Input, Label } from '../../../common/atoms';

export function BedTypes({ details, onChangeDetails, errors }) {
  const selected = Array.isArray(details.bedTypes)
    ? details.bedTypes
    /* A row created before this control carries one bed FORMAT string in
       `bedType`. That is a different question, so nothing is pre-selected
       from it — the agent picks the occupancies afresh. */
    : [];

  const prices = details.sharingPrices || {};

  const setMap = (mapField, key, value) => {
    const next = { ...(details[mapField] || {}) };
    if (value === '' || value === null || value === false) delete next[key];
    else next[key] = value;
    onChangeDetails(mapField, next);
  };

  const toggle = (bed) => {
    const has = selected.includes(bed);
    if (has) {
      /* A price for a bed nobody offers would resurface on the site, so it
         goes with the bed — and before the selection changes, because the
         headline-rate recompute hangs off `bedTypes` and should read the
         prices that are already gone. Photos go the same way, staged and
         saved alike. */
      ['sharingPrices', 'sharingAC', 'sharingAcPrices', 'localSharingImages', 'sharingImages'].forEach((mapField) => {
        const map = details[mapField];
        if (map && map[bed] !== undefined) {
          if (mapField === 'localSharingImages') {
            (map[bed] || []).forEach((item) => {
              if (item?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
            });
          }
          const trimmed = { ...map };
          delete trimmed[bed];
          onChangeDetails(mapField, trimmed);
        }
      });
    }
    onChangeDetails('bedTypes', has ? selected.filter((b) => b !== bed) : [...selected, bed]);
  };

  const custom = Array.isArray(details.customBedTypes) ? details.customBedTypes : [];
  const bedOptions = [
    ...BED_TYPES.map((b) => ({ id: b, label: b })),
    ...custom.filter((c) => !BED_TYPES.includes(c)).map((c) => ({ id: c, label: c })),
  ];

  const removeCustom = (bed) => {
    if (selected.includes(bed)) toggle(bed);
    onChangeDetails('customBedTypes', custom.filter((b) => b !== bed));
  };

  return (
    <Box>
      <ChipPicker
        id="bedTypes"
        label="Bed Types Available *"
        error={errors['categoryDetails.bedTypes']}
        presets={BED_TYPES.map((b) => ({ id: b, label: b }))}
        custom={custom}
        selected={selected}
        addPrompt="What else does this place sell a bed in?"
        addHint="e.g. 6 Sharing, Family Room"
        onToggle={toggle}
        onAddCustom={(text) => {
          onChangeDetails('customBedTypes', [...custom, text]);
          onChangeDetails('bedTypes', [...selected, text]);
        }}
        onRemoveCustom={removeCustom}
      />

      {selected.length > 0 && (
        <Box>
          {bedOptions.filter((b) => selected.includes(b.id)).map(({ id: bed }) => {
            const hasAC = !!(details.sharingAC && details.sharingAC[bed]);
            return (
              <Box
                key={bed}
                style={{
                  background: '#f8faf8', border: '1px solid #e2e8f0',
                  borderRadius: '10px', padding: '14px', marginBottom: '12px',
                }}
              >
                <Inline style={{ fontSize: '0.88rem', color: '#181e1b', fontWeight: 700 }}>{bed}</Inline>

                <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '10px' }}>
                  <Box>
                    <Inline style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>Total Beds Available *</Inline>
                    <Input
                      type="number"
                      className="form-input"
                      id={`sharingRooms-${bed}`}
                      min="0"
                      placeholder="e.g. 12"
                      value={(details.sharingBeds || {})[bed] ?? ''}
                      onChange={(e) => setMap('sharingBeds', bed, Number(e.target.value) || '')}
                      style={{ marginTop: '4px', padding: '8px 12px', fontSize: '0.85rem', borderColor: errorBorder(errors[roomCountKey(bed)]) }}
                    />
                    <FieldError message={errors[roomCountKey(bed)]} />
                  </Box>

                  <Label style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', cursor: 'pointer', paddingBottom: '8px' }}>
                    <Input
                      type="checkbox"
                      checked={hasAC}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setMap('sharingAC', bed, isChecked);
                        /* An AC rate for a bed with no AC would resurface as a
                           price on the site, so all three go with the tick. */
                        if (!isChecked) {
                          RATE_STRUCTURES.forEach((rate) => setMap(rate.ac, bed, ''));
                        }
                      }}
                      style={{ width: '15px', height: '15px', accentColor: '#45855a' }}
                    />
                    <Inline style={{ fontSize: '0.78rem', color: hasAC ? '#45855a' : '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Snowflake size={12} />
                      <Inline>AC available for {bed}</Inline>
                    </Inline>
                  </Label>
                </Box>

                {/* The rate grid: three structures, and an AC column only when
                    AC is on offer. A hostel sells the same bed nightly to a
                    traveller and monthly to a student. */}
                <Box style={{ marginTop: '12px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                  <Inline style={{ display: 'block', fontSize: '0.75rem', color: '#45855a', fontWeight: 600, marginBottom: '10px' }}>
                    Rates for {bed} — fill in the ones this hostel actually offers
                  </Inline>

                  <Box style={{ display: 'grid', gridTemplateColumns: hasAC ? '1fr 1fr 1fr' : '1fr 1fr', gap: '10px', alignItems: 'end' }}>
                    <Inline style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Structure</Inline>
                    <Inline style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Non-AC (₹)</Inline>
                    {hasAC && (
                      <Inline style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>AC (₹)</Inline>
                    )}

                    {RATE_STRUCTURES.map((rate) => (
                      <React.Fragment key={rate.id}>
                        <Inline style={{ fontSize: '0.82rem', color: '#181e1b', fontWeight: 600, paddingBottom: '10px' }}>
                          {rate.label}{rate.required ? ' *' : ''}
                        </Inline>
                        <Box>
                          <Input
                            type="number"
                            className="form-input"
                            id={rate.required ? `sharingPrice-${bed}` : `${rate.base}-${bed}`}
                            min="0"
                            placeholder={rate.hint}
                            value={(details[rate.base] || {})[bed] ?? ''}
                            onChange={(e) => setMap(rate.base, bed, Number(e.target.value) || '')}
                            style={{ padding: '8px 12px', fontSize: '0.85rem', borderColor: rate.required ? errorBorder(errors[sharingPriceKey(bed)]) : undefined }}
                          />
                          {rate.required && <FieldError message={errors[sharingPriceKey(bed)]} />}
                        </Box>
                        {hasAC && (
                          <Box>
                            <Input
                              type="number"
                              className="form-input"
                              id={rate.required ? `sharingAcPrice-${bed}` : `${rate.ac}-${bed}`}
                              min="0"
                              placeholder={rate.hint}
                              value={(details[rate.ac] || {})[bed] ?? ''}
                              onChange={(e) => setMap(rate.ac, bed, Number(e.target.value) || '')}
                              style={{ padding: '8px 12px', fontSize: '0.85rem', borderColor: rate.required ? errorBorder(errors[sharingAcPriceKey(bed)]) : '#c2e2cc' }}
                            />
                            {rate.required && <FieldError message={errors[sharingAcPriceKey(bed)]} />}
                          </Box>
                        )}
                      </React.Fragment>
                    ))}
                  </Box>
                </Box>

                <LayoutPhotos
                  details={details}
                  onChangeDetails={onChangeDetails}
                  layoutId={bed}
                  layoutLabel={bed}
                />
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
