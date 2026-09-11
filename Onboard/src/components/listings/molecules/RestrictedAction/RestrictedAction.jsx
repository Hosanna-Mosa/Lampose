import React from 'react';
import { PERMISSION_NOTES } from '../../utils/permissionNotes';
import { Loader2, Lock } from 'lucide-react';
import { Box, Inline, PlainButton } from '../../../common/atoms';

export function RestrictedAction({ icon: Icon, label, tone, permission, loading, busy, onClick }) {
  const allowed = !loading && permission.allowed;
  const note = PERMISSION_NOTES[permission.status] || PERMISSION_NOTES.none;
  const NoteIcon = note.icon;

  const palette = tone === 'delete'
    ? { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' }
    : { bg: '#eef4ff', border: '#c7d7fe', text: '#2952b3' };

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <PlainButton
        type="button"
        onClick={onClick}
        disabled={!allowed || busy}
        title={allowed ? label : `${label} — ${note.text}`}
        style={{
          padding: '9px 16px',
          borderRadius: '10px',
          background: allowed ? palette.bg : '#f1f5f9',
          border: `1px solid ${allowed ? palette.border : '#e2e8f0'}`,
          color: allowed ? palette.text : '#94a3b8',
          fontSize: '0.85rem',
          fontWeight: 700,
          cursor: allowed && !busy ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        {busy
          ? <Loader2 size={16} className="animate-spin" />
          : allowed ? <Icon size={16} /> : <Lock size={16} />}
        <Inline>{label}</Inline>
      </PlainButton>

      <Inline style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 600, color: loading ? '#94a3b8' : note.color }}>
        {loading ? <Loader2 size={11} className="animate-spin" /> : <NoteIcon size={11} />}
        <Inline>{loading ? 'Checking access…' : note.text}</Inline>
      </Inline>
    </Box>
  );
}
