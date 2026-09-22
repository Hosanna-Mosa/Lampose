import React, { useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Box, Heading, PlainButton, Text } from '../../atoms';

/**
 * The "your token died on the server" dialog.
 *
 * Shown the instant `App.jsx` sees an `api:unauthorized` event — see the
 * listener there and the response interceptor in `services/api.js` that
 * dispatches it. Nothing has been cleared from `localStorage` yet at that
 * point; `onLogout` is what actually does that, once the agent presses the
 * one button on offer.
 *
 * There is no Cancel and no quiet dismiss: the session really is dead by the
 * time this is on screen (the server said so), so there is nothing to go
 * back to. A backdrop click and Escape both run `onLogout` rather than
 * closing the dialog, because closing it without logging out would leave the
 * agent looking at a console that is signed in on screen and signed out on
 * the server — every request from here would just 401 again.
 */
export function SessionExpiredDialog({ open, onLogout }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onLogout();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onLogout]);

  if (!open) return null;

  return (
    <Box
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-description"
      onClick={(e) => {
        if (e.target === e.currentTarget) onLogout();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        // Above the submit-progress overlay (10000) in App.jsx — a dead
        // session outranks an in-flight save; the agent still needs to see
        // this even while a submit spinner is up.
        zIndex: 10001,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      className="animate-fade-in"
    >
      <Box
        style={{
          maxWidth: '400px',
          width: '100%',
          padding: '32px 24px',
          textAlign: 'center',
          background: '#ffffff',
          borderRadius: '24px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        }}
      >
        <Box
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: '#fef2f2',
            border: '2px solid #dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: '#dc2626',
          }}
        >
          <ShieldAlert size={28} />
        </Box>

        <Heading
          id="session-expired-title"
          level={2}
          style={{ fontSize: '1.3rem', fontWeight: 800, color: '#181e1b', marginBottom: '8px' }}
        >
          Session expired
        </Heading>
        <Text
          id="session-expired-description"
          style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '24px', lineHeight: '1.4' }}
        >
          Please log out and sign in again.
        </Text>

        <PlainButton
          onClick={onLogout}
          className="btn btn-primary"
          style={{ padding: '12px 28px', minWidth: '160px' }}
        >
          Logout
        </PlainButton>
      </Box>
    </Box>
  );
}
