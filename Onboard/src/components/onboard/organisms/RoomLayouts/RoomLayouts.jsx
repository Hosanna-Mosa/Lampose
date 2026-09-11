import React from 'react';
import { TENANT_OPTIONS, ROOM_LAYOUTS, FURNISHING_ITEMS } from '../../utils/categoryFieldOptions';
import { errorBorder, FieldError } from '../../atoms/FieldError/FieldError';
import { sharingPriceKey, roomCountKey, furnishingKey } from '../../../../services/validation.js';
import { Key } from 'lucide-react';
import { ChipPicker } from '../../molecules/ChipPicker';
import { FurnishingItems } from '../FurnishingItems';
import { LayoutPhotos } from '../LayoutPhotos';
import { Box, Inline, Input, Option, Select } from '../../../common/atoms';

export function RoomLayouts({ category, details, onChangeDetails, errors }) {
  const tenantOptions = TENANT_OPTIONS[category] || TENANT_OPTIONS.COLIVE;
  const selected = Array.isArray(details.roomTypes)
    ? details.roomTypes
    /* A row created before this control carries one layout as a string. */
    : (details.roomType ? [details.roomType] : []);

  const prices = details.sharingPrices || {};
  const counts = details.sharingRooms || {};
  const byLayout = details.furnishingByLayout || {};
  const tenantsByLayout = details.allowedTenantsByLayout || {};
  const kitchenByLayout = details.kitchenByLayout || {};
  const itemsByLayout = details.furnishingItemsByLayout || {};
  const custom = Array.isArray(details.customFurnishingItems) ? details.customFurnishingItems : [];

  const setMap = (mapField, key, value) => {
    const next = { ...(details[mapField] || {}) };
    if (value === '' || value === null || value === undefined) delete next[key];
    else next[key] = value;
    onChangeDetails(mapField, next);
  };

  const toggle = (layout) => {
    const has = selected.includes(layout);
    const next = has ? selected.filter((l) => l !== layout) : [...selected, layout];

    if (has) {
      /* Everything recorded against a layout nobody offers would resurface on
         the site, so it all goes with the layout — and before the selection
         changes, because the headline-rent recompute hangs off `roomTypes`. */
      ['sharingPrices', 'sharingRooms', 'sharingBeds', 'furnishingByLayout',
        'furnishingItemsByLayout', 'allowedTenantsByLayout', 'kitchenByLayout',
        'localSharingImages', 'sharingImages']
        .forEach((mapField) => {
          const map = details[mapField];
          if (map && map[layout] !== undefined) {
            if (mapField === 'localSharingImages') {
              (map[layout] || []).forEach((item) => {
                if (item?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
              });
            }
            const trimmed = { ...map };
            delete trimmed[layout];
            onChangeDetails(mapField, trimmed);
          }
        });
    } else {
      /* A new layout opens on the same level as the last one an agent chose,
         which is right far more often than a fixed default: a building is
         usually furnished to one standard throughout. */
      const last = selected.length ? selected[selected.length - 1] : null;
      setMap('furnishingByLayout', layout, (last && byLayout[last]) || 'Semi-Furnished');
      setMap('allowedTenantsByLayout', layout, (last && tenantsByLayout[last]) || tenantOptions[0].id);
      setMap('kitchenByLayout', layout, last && kitchenByLayout[last] !== undefined
        ? kitchenByLayout[last]
        : true);
    }

    onChangeDetails('roomTypes', next);
    onChangeDetails('roomType', next[0] || '');
  };

  const customLayouts = Array.isArray(details.customRoomTypes) ? details.customRoomTypes : [];
  const presetIds = ROOM_LAYOUTS.map((l) => l.id);
  const layoutOptions = [
    ...ROOM_LAYOUTS,
    ...customLayouts.filter((c) => !presetIds.includes(c)).map((c) => ({ id: c, label: c })),
  ];

  const removeCustomLayout = (layout) => {
    if (selected.includes(layout)) toggle(layout);
    onChangeDetails('customRoomTypes', customLayouts.filter((l) => l !== layout));
  };

  return (
    <Box>
      <ChipPicker
        id="roomTypes"
        label="Room / Flat Layouts Available *"
        error={errors['categoryDetails.roomTypes']}
        presets={ROOM_LAYOUTS}
        custom={customLayouts}
        selected={selected}
        addPrompt="What other layout does this building let?"
        addHint="e.g. 4 BHK Villa, Penthouse"
        onToggle={toggle}
        onAddCustom={(text) => {
          onChangeDetails('customRoomTypes', [...customLayouts, text]);
          /* Selected straight away, and seeded like any other new layout —
             `toggle` does that, so it is called rather than duplicated. */
          toggle(text);
        }}
        onRemoveCustom={removeCustomLayout}
      />

      {layoutOptions.filter((l) => selected.includes(l.id)).map((layout) => {
        const level = byLayout[layout.id] || 'Semi-Furnished';
        return (
          <Box
            key={layout.id}
            style={{
              background: '#f8faf8', border: '1px solid #e2e8f0',
              borderRadius: '10px', padding: '14px', marginBottom: '12px',
            }}
          >
            <Inline style={{ fontSize: '0.88rem', color: '#181e1b', fontWeight: 700 }}>{layout.label}</Inline>

            <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '10px' }}>
              <Box>
                <Inline style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>Monthly Rent (₹) *</Inline>
                <Input
                  type="number"
                  className="form-input"
                  id={`sharingPrice-${layout.id}`}
                  min="0"
                  placeholder="e.g. 12000"
                  value={prices[layout.id] ?? ''}
                  onChange={(e) => setMap('sharingPrices', layout.id, Number(e.target.value) || '')}
                  style={{ marginTop: '4px', padding: '8px 12px', fontSize: '0.85rem', borderColor: errorBorder(errors[sharingPriceKey(layout.id)]) }}
                />
                <FieldError message={errors[sharingPriceKey(layout.id)]} />
              </Box>

              <Box>
                <Inline style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>How many of these?</Inline>
                <Input
                  type="number"
                  className="form-input"
                  id={`sharingRooms-${layout.id}`}
                  min="0"
                  placeholder="e.g. 3"
                  value={counts[layout.id] ?? ''}
                  onChange={(e) => {
                    const count = Number(e.target.value) || '';
                    setMap('sharingRooms', layout.id, count);
                    /* One flat is one lettable unit, so beds equal the count.
                       Written rather than derived on read, because that is the
                       number the request flow decrements. */
                    setMap('sharingBeds', layout.id, count);
                  }}
                  style={{ marginTop: '4px', padding: '8px 12px', fontSize: '0.85rem' }}
                />
                <Inline style={{ fontSize: '0.72rem', color: counts[layout.id] ? '#45855a' : '#94a3b8', fontWeight: 600 }}>
                  {counts[layout.id]
                    ? `${counts[layout.id]} available to let`
                    : 'How many of this layout the building has'}
                </Inline>
                <FieldError message={errors[roomCountKey(layout.id)]} />
              </Box>

              <Box>
                <Inline style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>Furnishing Status</Inline>
                <Select
                  className="form-select"
                  value={level}
                  onChange={(e) => {
                    const next = e.target.value;
                    setMap('furnishingByLayout', layout.id, next);

                    /* The ticked amenities answered the previous level's list,
                       so anything the new one does not offer is dropped.
                       Custom items were typed for this property rather than
                       for a level, so they stay. Unfurnished clears the lot. */
                    const base = FURNISHING_ITEMS[next] || [];
                    const ticked = itemsByLayout[layout.id] || [];
                    setMap(
                      'furnishingItemsByLayout',
                      layout.id,
                      base.length ? ticked.filter((i) => base.includes(i) || custom.includes(i)) : [],
                    );
                  }}
                  style={{ marginTop: '4px', padding: '8px 12px', fontSize: '0.85rem' }}
                >
                  <Option value="Fully Furnished">Fully Furnished</Option>
                  <Option value="Semi-Furnished">Semi-Furnished</Option>
                  <Option value="Unfurnished">Unfurnished</Option>
                </Select>
                <FieldError message={errors[furnishingKey(layout.id)]} />
              </Box>

              <Box>
                <Inline style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>Allowed Tenants</Inline>
                <Select
                  className="form-select"
                  value={tenantsByLayout[layout.id] || tenantOptions[0].id}
                  onChange={(e) => setMap('allowedTenantsByLayout', layout.id, e.target.value)}
                  style={{ marginTop: '4px', padding: '8px 12px', fontSize: '0.85rem' }}
                >
                  {tenantOptions.map((option) => (
                    <Option key={option.id} value={option.id}>{option.label}</Option>
                  ))}
                  {/* A value saved before this list was narrowed stays
                      selectable, so editing an old listing cannot silently
                      change who it is let to. */}
                  {tenantsByLayout[layout.id]
                    && !tenantOptions.some((o) => o.id === tenantsByLayout[layout.id]) ? (
                      <Option value={tenantsByLayout[layout.id]}>{tenantsByLayout[layout.id]}</Option>
                    ) : null}
                </Select>
              </Box>

              <Box>
                <Inline style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>Kitchen / Cooking Provision?</Inline>
                <Select
                  className="form-select"
                  value={kitchenByLayout[layout.id] === false ? 'No' : 'Yes'}
                  onChange={(e) => setMap('kitchenByLayout', layout.id, e.target.value === 'Yes')}
                  style={{ marginTop: '4px', padding: '8px 12px', fontSize: '0.85rem' }}
                >
                  <Option value="Yes">Yes (Kitchen &amp; Cooking Allowed)</Option>
                  <Option value="No">No Kitchen Setup</Option>
                </Select>
              </Box>
            </Box>

            <FurnishingItems
              level={level}
              selected={itemsByLayout[layout.id] || []}
              custom={custom}
              label={`Key Amenities Included — what the ${level.toLowerCase()} ${layout.label} gets them`}
              onChangeSelected={(next) => setMap('furnishingItemsByLayout', layout.id, next)}
              onChangeCustom={(next) => onChangeDetails('customFurnishingItems', next)}
            />

            <LayoutPhotos
              details={details}
              onChangeDetails={onChangeDetails}
              layoutId={layout.id}
              layoutLabel={layout.label}
            />
          </Box>
        );
      })}
    </Box>
  );
}
