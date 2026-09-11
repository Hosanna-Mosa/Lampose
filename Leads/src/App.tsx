import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { MainAppContent } from './components/common/templates/MainAppContent';
export function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
