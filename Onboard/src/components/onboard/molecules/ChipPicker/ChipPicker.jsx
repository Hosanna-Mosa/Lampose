import React from 'react';
import { useState } from 'react';
import { FieldError } from '../../atoms/FieldError/FieldError';
import { Check, X, Plus } from 'lucide-react';
import { Box, Inline, Input, Label, PlainButton } from '../../../common/atoms';

export function ChipPicker({
  presets, custom, selected, label, error, addPrompt, addHint,
  onToggle, onAddCustom, onRemoveCustom, id,
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const presetIds = presets.map((o) => o.id);
  const options = [...presets, ...custom.filter((c) => !presetIds.includes(c)).map((c) => ({ id: c, label: c }))];

  const commit = () => {
    const text = draft.trim();
    if (!text) return;
    /* Case-insensitive, so "1 bhk" does not join a list that already says
       "1 BHK" and leave the property offering both. */
    const clash = options.find((o) => o.id.toLowerCase() === text.toLowerCase());
    if (clash) {
      if (!selected.includes(clash.id)) onToggle(clash.id);
    } else {
      onAddCustom(text);
    }
    setDraft('');
    setCustomOpen(false);
  };

  return (
    <Box className="form-group" style={{ gridColumn: '1 / -1' }} id={id}>
      <Label className="form-label">{label}</Label>
      <FieldError message={error} />

      <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        {options.map((option) => {
          const isSelected = selected.includes(option.id);
          const isCustom = !presetIds.includes(option.id);
          return (
            <Box
              key={option.id}
              onClick={() => onToggle(option.id)}
              style={{
                padding: isCustom ? '8px 8px 8px 16px' : '8px 16px',
                borderRadius: '20px',
                background: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: isSelected ? '1px solid #10b981' : '1px solid var(--border-glass)',
                color: isSelected ? '#34d399' : 'var(--text-sub)',
                cursor: 'pointer', fontSize: '0.875rem',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              {isSelected && <Check size={14} />}
              <Inline>{option.label}</Inline>
              {isCustom && (
                <PlainButton
                  type="button"
                  title={`Remove ${option.label}`}
                  aria-label={`Remove ${option.label}`}
                  onClick={(e) => { e.stopPropagation(); onRemoveCustom(option.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '18px', height: '18px', borderRadius: '50%', border: 'none',
                    background: 'rgba(100, 116, 139, 0.15)', color: 'inherit', cursor: 'pointer', padding: 0,
                  }}
                >
                  <X size={11} />
                </PlainButton>
              )}
            </Box>
          );
        })}

        <PlainButton
          type="button"
          onClick={() => { setCustomOpen((o) => !o); setDraft(''); }}
          style={{
            padding: '8px 16px', borderRadius: '20px',
            background: customOpen ? '#eaf3ed' : 'transparent',
            border: `1px dashed ${customOpen ? '#45855a' : '#94a3b8'}`,
            color: customOpen ? '#2f6b45' : '#64748b',
            cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <Plus size={14} />
          <Inline>Custom</Inline>
        </PlainButton>
      </Box>

      {customOpen && (
        <Box style={{
          marginTop: '12px', padding: '14px 16px', background: '#ffffff',
          borderRadius: '12px', border: '1px solid #c2e2cc', maxWidth: '420px',
        }}>
          <Inline style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginBottom: '8px' }}>
            {addPrompt}
          </Inline>
          <Box style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Input
              type="text"
              className="form-input"
              autoFocus
              value={draft}
              maxLength={40}
              placeholder={addHint}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { setCustomOpen(false); setDraft(''); }
              }}
              style={{ flex: 1 }}
            />
            <PlainButton
              type="button"
              onClick={commit}
              disabled={!draft.trim()}
              className="btn-primary"
              style={{ padding: '8px 18px', fontSize: '0.85rem', opacity: draft.trim() ? 1 : 0.5 }}
            >
              Add
            </PlainButton>
          </Box>
        </Box>
      )}
    </Box>
  );
}
