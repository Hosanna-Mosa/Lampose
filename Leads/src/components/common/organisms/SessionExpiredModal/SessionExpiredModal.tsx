import React, { useEffect, useRef } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { Box, Heading, PlainButton, Text } from '../../atoms';

/**
 * The one dialog every client app in this monorepo now shows instead of a
 * silent sign-out: once a 401 proves the stored token is dead (see the
 * `api:unauthorized` listener in `AuthContext`), this sits as an overlay
 * over whatever page is currently on screen until the person clicks Logout.
 *
 * There is deliberately no other way out. Escape and a click on the
 * backdrop both call `logout()` as well, rather than merely hiding the
 * dialog — a session that is already dead has nothing sensible to be
 * dismissed BACK TO, so every way of closing this means the same thing.
 *
 * Mounted in `App.tsx` as a sibling of `MainAppContent`, not inside it, so
 * it renders regardless of `isAuthenticated` — which is deliberately still
 * `true` at the moment this needs to show, since `logout()` (the only thing
 * that clears it) hasn't run yet.
 */
export const SessionExpiredModal: React.FC = () => {
  const { sessionExpired, logout } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);

  /* `logout` gets a new identity every render (AuthContext doesn't memoise
     it), so reading it through a ref rather than listing it as an effect
     dependency is what keeps this effect running only when `sessionExpired`
     itself changes, not on every render while the dialog is open. */
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  useEffect(() => {
    if (!sessionExpired) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') logoutRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // Moves focus onto the dialog once, on open, so a screen reader
    // announces it and Enter on the Logout button works immediately.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [sessionExpired]);

  if (!sessionExpired) return null;

  return (
    <Box className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <Box
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
        onClick={logout}
        aria-hidden
      />
      {/*
        A plain `<div>` rather than `Box` here: `Box` in this app is a bare
        function component (no `forwardRef`), so a `ref` handed to it would
        silently fail to attach under React 18 — and focusing the panel on
        open is the one thing this element exists for.
      */}
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-label="Session expired"
        tabIndex={-1}
        className="relative bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-center outline-none"
      >
        <Heading level={2} className="text-lg font-extrabold text-slate-900">
          Session expired
        </Heading>
        <Text className="text-sm text-slate-500">Please log out and sign in again.</Text>
        <PlainButton
          onClick={logout}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold text-xs shadow-xl shadow-cyan-500/25 transition cursor-pointer"
        >
          Logout
        </PlainButton>
      </div>
    </Box>
  );
};
