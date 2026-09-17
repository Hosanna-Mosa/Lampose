import React from 'react';
import { Check, X, CloudUpload } from 'lucide-react';
import { FieldError } from '../../atoms/FieldError/FieldError';
import { Box, Inline, Input, Label, PlainButton, Text } from '../../../common/atoms';

export function Slot({ kind, title, blurb, errorKey, children, docs, setDoc, errors }) {
  const current = docs[kind];
  return (
    <Box style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
      <Inline style={{ fontSize: '0.88rem', color: '#181e1b', fontWeight: 700 }}>{title} *</Inline>
      <Text style={{ fontSize: '0.78rem', color: '#64748b', margin: '4px 0 10px', lineHeight: 1.4 }}>{blurb}</Text>

      {children}

      {current?.file ? (
        <Box style={{
          display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px',
          padding: '8px 12px', background: '#eaf3ed', border: '1px solid #c2e2cc', borderRadius: '8px',
        }}>
          <Check size={14} color="#45855a" />
          <Inline style={{ fontSize: '0.8rem', color: '#2f6b45', fontWeight: 600, flex: 1, wordBreak: 'break-all' }}>
            {current.file.name}
          </Inline>
          <PlainButton
            type="button"
            onClick={() => setDoc(kind, null)}
            title="Remove"
            aria-label={`Remove ${title}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '20px', height: '20px', borderRadius: '50%', border: 'none',
              background: 'rgba(100, 116, 139, 0.15)', color: '#475569', cursor: 'pointer', padding: 0,
            }}
          >
            <X size={12} />
          </PlainButton>
        </Box>
      ) : (
        <Label
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            marginTop: '10px', padding: '12px', borderRadius: '8px',
            border: '1px dashed #94a3b8', color: '#64748b', cursor: 'pointer',
            fontSize: '0.82rem', fontWeight: 600,
          }}
        >
          <CloudUpload size={15} />
          <Inline>Choose a photo or PDF</Inline>
          <Input
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files && e.target.files[0];
              if (file) setDoc(kind, { file });
              /* Cleared so picking the same file twice still fires. */
              e.target.value = '';
            }}
          />
        </Label>
      )}

      <FieldError message={errors[errorKey]} />
    </Box>
  );
}
