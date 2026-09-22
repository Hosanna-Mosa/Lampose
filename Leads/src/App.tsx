import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { MainAppContent } from './components/common/templates/MainAppContent';
import { SessionExpiredModal } from './components/common/organisms/SessionExpiredModal';
export function App() {
  return (
    <AuthProvider>
      <MainAppContent />
      {/*
        A sibling of MainAppContent, not something rendered from inside it —
        MainAppContent returns <LoginPage/> early whenever `isAuthenticated`
        is false, and `isAuthenticated` is deliberately still true for the
        instant this needs to appear (nothing has been cleared yet, see
        AuthContext). Mounting it here means it renders over whatever
        MainAppContent is showing, authenticated or not, without needing to
        thread a flag through that early return.
      */}
      <SessionExpiredModal />
    </AuthProvider>
  );
}
