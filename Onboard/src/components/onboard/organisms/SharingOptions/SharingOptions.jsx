import React from 'react';
import { useState } from 'react';
import { BASE_SHARING_TYPES } from '../../utils/categoryFieldOptions';
import { sharingLabelFor } from '../../utils/sharingLabel';
import { FieldError, errorBorder } from '../../atoms/FieldError/FieldError';
import { Check, X, Plus, Snowflake } from 'lucide-react';
import { sharingPriceKey, sharingAcPriceKey } from '../../../../services/validation.js';
import { LayoutPhotos } from '../LayoutPhotos';
import { Box, Inline, Input, Label, PlainButton } from '../../../common/atoms';

export function SharingOptions({ details, onChangeDetails, onToggleType, setMapValue, errors = {} }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customCount, setCustomCount] = useState('');
  const [customError, setCustomError] = useState('');

  const selected = Array.isArray(details.sharingTypes) ? details.sharingTypes : [];
  const custom = Array.isArray(details.customSharingTypes) ? details.customSharingTypes : [];

  /* Standard options, then the ones this agent added, then anything already
     ticked that matches neither — the last of which stops a listing edited
     elsewhere from losing an option it is already priced on. */
  const options = [...BASE_SHARING_TYPES, ...custom.filter((t) => !BASE_SHARING_TYPES.includes(t))];
  selected.forEach((t) => { if (!options.includes(t)) options.push(t); });

  const closeCustom = () => {
    setCustomOpen(false);
    setCustomCount('');
    setCustomError('');
  };

  const addCustom = () => {
    const count = Number(customCount);
    if (!customCount || !Number.isInteger(count) || count < 1 || count > 50) {
      setCustomError('Enter how many people share one room (1–50).');
      return;
    }

    const label = sharingLabelFor(count);
    if (!options.includes(label)) {
      onChangeDetails('customSharingTypes', [...custom, label]);
    }
    /* Adding an option is the act of choosing it — nobody types an occupancy
       in order to leave it unticked. Re-adding one that already exists just
       ticks it, which is the useful reading of the same gesture. */
    if (!selected.includes(label)) {
      onChangeDetails('sharingTypes', [...selected, label]);
    }
    closeCustom();
  };

  /** Removing a custom option takes its prices with it, exactly as unticking
   *  a standard one does — a stale price would keep counting toward the
   *  headline rent App.jsx derives from this map. */
  const removeCustom = (label) => {
    ['sharingPrices', 'sharingAC', 'sharingAcPrices', 'sharingRooms', 'sharingBeds',
      'localSharingImages', 'sharingImages'].forEach((mapField) => {
      const map = details[mapField];
      if (map && map[label] !== undefined) {
        if (mapField === 'localSharingImages') {
          (map[label] || []).forEach((item) => {
            if (item?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
          });
        }
        const trimmed = { ...map };
        delete trimmed[label];
        onChangeDetails(mapField, trimmed);
      }
    });
    onChangeDetails('customSharingTypes', custom.filter((t) => t !== label));
    // Last: the headline-rent recompute hangs off this key and should run
    // once the prices it reads are already gone.
    onChangeDetails('sharingTypes', selected.filter((t) => t !== label));
  };

  return (
    <Box id="sharingOptions" className="form-group" style={{ gridColumn: '1 / -1' }}>
      <Label className="form-label">Sharing Options Available *</Label>
      <FieldError message={errors['categoryDetails.sharingTypes']} />
      <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        {options.map((type) => {
          const isSelected = selected.includes(type);
          const isCustom = !BASE_SHARING_TYPES.includes(type);
          return (
            <Box
              key={type}
              onClick={() => onToggleType(type)}
              style={{
                padding: isCustom ? '8px 8px 8px 16px' : '8px 16px',
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
              {isCustom && (
                <PlainButton
                  type="button"
                  title={`Remove ${type}`}
                  aria-label={`Remove ${type}`}
                  onClick={(e) => { e.stopPropagation(); removeCustom(type); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(100, 116, 139, 0.15)',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  <X size={12} />
                </PlainButton>
              )}
            </Box>
          );
        })}

        {/* Custom — sits after base sharing options, and reads as an action rather
            than a preset occupancy, hence the dashed border. */}
        <PlainButton
          type="button"
          onClick={() => (customOpen ? closeCustom() : setCustomOpen(true))}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            background: customOpen ? '#eaf3ed' : 'transparent',
            border: `1px dashed ${customOpen ? '#45855a' : '#94a3b8'}`,
            color: customOpen ? '#2f6b45' : '#64748b',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Plus size={14} />
          <Inline>Custom</Inline>
        </PlainButton>
      </Box>

      {customOpen && (
        <Box style={{
          marginTop: '12px',
          padding: '14px 16px',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #c2e2cc',
          maxWidth: '420px'
        }}>
          <Inline style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginBottom: '8px' }}>
            How many people share one room?
          </Inline>
          <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <Input
              type="number"
              min="1"
              max="50"
              autoFocus
              placeholder="e.g. 6"
              value={customCount}
              onChange={(e) => { setCustomCount(e.target.value); setCustomError(''); }}
              // The panel is inside the onboarding <form>; Enter here means
              // "add this option", never "submit the whole property".
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
                if (e.key === 'Escape') closeCustom();
              }}
              className="form-input"
              style={{ width: '110px', padding: '8px 12px', fontSize: '0.85rem' }}
            />
            <PlainButton
              type="button"
              onClick={addCustom}
              className="btn btn-primary"
              style={{ padding: '8px 18px', background: '#45855a', borderRadius: '10px', fontSize: '0.85rem' }}
            >
              <Plus size={15} />
              <Inline>Add option</Inline>
            </PlainButton>
            <PlainButton
              type="button"
              onClick={closeCustom}
              style={{ padding: '8px 14px', borderRadius: '10px', background: '#ffffff', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Cancel
            </PlainButton>
          </Box>

          {customError
            ? <Inline style={{ display: 'block', fontSize: '0.78rem', color: '#dc2626', marginTop: '8px' }}>{customError}</Inline>
            : (
              <Inline style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginTop: '8px' }}>
                {customCount && Number(customCount) > 0 && Number(customCount) <= 50 && Number.isInteger(Number(customCount))
                  ? `Adds "${sharingLabelFor(Number(customCount))}" with its own rent and AC option.`
                  : 'Adds an occupancy the list above does not cover, e.g. 6 gives "6 Sharing".'}
              </Inline>
            )}
        </Box>
      )}

      {/* Sharing Prices (Dynamic based on selected sharing types) */}
      {selected.length > 0 && (
        <Box style={{ marginTop: '16px', padding: '16px', background: 'rgba(0, 0, 0, 0.02)', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
          <Label className="form-label" style={{ fontSize: '0.85rem', color: '#181e1b', fontWeight: 700, marginBottom: '10px' }}>
            Monthly Price for Selected Sharing Options (₹):
          </Label>
          <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {selected.map((type) => {
              const currentPrice = details.sharingPrices ? details.sharingPrices[type] : '';
              const hasAC = !!(details.sharingAC && details.sharingAC[type]);
              const acPrice = details.sharingAcPrices ? details.sharingAcPrices[type] : '';

              /* How many beds this option has. This is the number the app
                 claims against when an owner accepts a request — without it
                 the option cannot be requested at all. */
              const beds = details.sharingBeds ? details.sharingBeds[type] : '';

              return (
                <Box
                  key={type}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '12px',
                    background: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <Inline style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>{type} Rent *</Inline>
                  <Input
                    id={`sharingPrice-${type}`}
                    type="number"
                    min="0"
                    placeholder="e.g. 6000"
                    value={currentPrice || ''}
                    onChange={(e) => setMapValue('sharingPrices', type, Number(e.target.value) || '')}
                    className="form-input"
                    style={{ padding: '8px 12px', fontSize: '0.85rem', borderColor: errorBorder(errors[sharingPriceKey(type)]) }}
                  />
                  <FieldError message={errors[sharingPriceKey(type)]} />

                  {/* Total beds for this option, entered directly — no room
                      count, no multiplication. Optional: an agent standing
                      outside a building does not always know the count, and
                      leaving it blank just means this option is priced but
                      not yet requestable until an owner or a later edit adds
                      it. */}
                  <Box style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                    <Inline style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                      Total {type} beds <Inline style={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</Inline>
                    </Inline>
                    <Input
                      id={`sharingBeds-${type}`}
                      type="number"
                      min="0"
                      placeholder="e.g. 12 — leave blank if unknown"
                      value={beds || ''}
                      onChange={(e) => setMapValue('sharingBeds', type, Number(e.target.value) || '')}
                      className="form-input"
                      style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                    />
                  </Box>

                  {/* AC is priced per sharing option, not per property */}
                  <Label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '2px' }}>
                    <Input
                      type="checkbox"
                      checked={hasAC}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setMapValue('sharingAC', type, isChecked);
                        if (!isChecked && details.sharingAcPrices && details.sharingAcPrices[type] !== undefined) {
                          const trimmed = { ...details.sharingAcPrices };
                          delete trimmed[type];
                          onChangeDetails('sharingAcPrices', trimmed);
                        }
                      }}
                      style={{ width: '16px', height: '16px', accentColor: '#45855a', cursor: 'pointer' }}
                    />
                    <Inline style={{ fontSize: '0.78rem', color: hasAC ? '#45855a' : '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Snowflake size={13} />
                      <Inline>AC available for {type}</Inline>
                    </Inline>
                  </Label>

                  {hasAC && (
                    <Box style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Inline style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>{type} AC Rent (₹) *</Inline>
                      <Input
                        id={`sharingAcPrice-${type}`}
                        type="number"
                        min="0"
                        placeholder="e.g. 8000"
                        value={acPrice || ''}
                        onChange={(e) => setMapValue('sharingAcPrices', type, Number(e.target.value) || '')}
                        className="form-input"
                        style={{ padding: '8px 12px', fontSize: '0.85rem', borderColor: errorBorder(errors[sharingAcPriceKey(type)]) || '#c2e2cc' }}
                      />
                      <FieldError message={errors[sharingAcPriceKey(type)]} />
                    </Box>
                  )}

                  <LayoutPhotos
                    details={details}
                    onChangeDetails={onChangeDetails}
                    layoutId={type}
                    layoutLabel={type}
                  />
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}
