import React from 'react';
import { useState } from 'react';
import { FURNISHING_ITEMS } from '../../utils/categoryFieldOptions';
import { Key, Check, X, Plus } from 'lucide-react';
import { Box, Inline, Input, PlainButton } from '../../../common/atoms';

export function FurnishingItems({ level, selected, custom, onChangeSelected, onChangeCustom, label }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const base = FURNISHING_ITEMS[level];
  if (!base) return null;

  const options = [...base, ...custom.filter((c) => !base.includes(c))];

  const toggle = (item) => {
    onChangeSelected(
      selected.includes(item) ? selected.filter((i) => i !== item) : [...selected, item],
    );
  };

  const addCustom = () => {
    const text = draft.trim();
    if (!text) return;
    /* Case-insensitive, so "wifi" does not join a list that already says
       "Wi-Fi" and leave the listing claiming both. */
    const clash = options.find((o) => o.toLowerCase() === text.toLowerCase());
    if (clash) {
      if (!selected.includes(clash)) toggle(clash);
    } else {
      onChangeCustom([...custom, text]);
      onChangeSelected([...selected, text]);
    }
    setDraft('');
    setCustomOpen(false);
  };

  const removeCustom = (item) => {
    onChangeCustom(custom.filter((i) => i !== item));
    onChangeSelected(selected.filter((i) => i !== item));
  };

  return (
    <Box style={{ marginTop: '12px' }}>
      <Inline style={{ display: 'block', fontSize: '0.75rem', color: '#45855a', fontWeight: 600, marginBottom: '8px' }}>
        {label || 'Key Amenities Included'}
      </Inline>

      <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        {options.map((item) => {
          const isSelected = selected.includes(item);
          const isCustom = !base.includes(item);
          return (
            <Box
              key={item}
              onClick={() => toggle(item)}
              style={{
                padding: isCustom ? '6px 6px 6px 12px' : '6px 12px',
                borderRadius: '18px',
                background: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: isSelected ? '1px solid #10b981' : '1px solid var(--border-glass)',
                color: isSelected ? '#34d399' : 'var(--text-sub)',
                cursor: 'pointer', fontSize: '0.8rem',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {isSelected && <Check size={12} />}
              <Inline>{item}</Inline>
              {isCustom && (
                <PlainButton
                  type="button"
                  title={`Remove ${item}`}
                  aria-label={`Remove ${item}`}
                  onClick={(e) => { e.stopPropagation(); removeCustom(item); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '16px', height: '16px', borderRadius: '50%', border: 'none',
                    background: 'rgba(100, 116, 139, 0.15)', color: 'inherit', cursor: 'pointer', padding: 0,
                  }}
                >
                  <X size={10} />
                </PlainButton>
              )}
            </Box>
          );
        })}

        <PlainButton
          type="button"
          onClick={() => { setCustomOpen((o) => !o); setDraft(''); }}
          style={{
            padding: '6px 12px', borderRadius: '18px',
            background: customOpen ? '#eaf3ed' : 'transparent',
            border: `1px dashed ${customOpen ? '#45855a' : '#94a3b8'}`,
            color: customOpen ? '#2f6b45' : '#64748b',
            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: '5px',
          }}
        >
          <Plus size={12} />
          <Inline>Custom</Inline>
        </PlainButton>
      </Box>

      {customOpen && (
        <Box style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', maxWidth: '380px' }}>
          <Input
            type="text"
            className="form-input"
            autoFocus
            value={draft}
            maxLength={40}
            placeholder="e.g. Study Desk"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
              if (e.key === 'Escape') { setCustomOpen(false); setDraft(''); }
            }}
            style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
          />
          <PlainButton
            type="button"
            onClick={addCustom}
            disabled={!draft.trim()}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.82rem', opacity: draft.trim() ? 1 : 0.5 }}
          >
            Add
          </PlainButton>
        </Box>
      )}
    </Box>
  );
}
