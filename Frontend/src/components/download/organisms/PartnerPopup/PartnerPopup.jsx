import React from 'react';
import { useEffect } from 'react';
import { APK } from '../../utils/apk';
import { Box, Heading, PlainButton } from '../../../common/atoms';

export function PartnerPopup({ open, onClose }) {
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <Box
      id="partnerPopup" className="popup"
      style={{ display: open ? 'flex' : 'none' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Box className="popup-content">
        <Heading level={3}>Select Partner Type</Heading>
        <PlainButton onClick={() => { window.location.href = APK.food; onClose(); }}>
          Food partner
        </PlainButton>
        <PlainButton onClick={() => { window.location.href = APK.stay; onClose(); }}>
          Stay partner
        </PlainButton>
        <PlainButton className="close" onClick={onClose}>Cancel</PlainButton>
      </Box>
    </Box>
  );
}
