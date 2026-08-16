import React, { useEffect, useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminLayout } from './components/layout/AdminLayout';
import { Dashboard } from './pages/Dashboard';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { UsersPage } from './pages/UsersPage';
import { PropertiesPage } from './pages/PropertiesPage';
import { VerificationsPage } from './pages/VerificationsPage';
import { PermissionsPage } from './pages/PermissionsPage';
import { SystemPage } from './pages/SystemPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { insightsService } from './api/services/insightsService';
import { permissionService } from './api/services/permissionService';
import { useFetch } from './lib/useFetch';

const VALID_TABS = [
  'dashboard',
  'analytics',
  'properties',
  'verifications',
  'permissions',
  'users',
  'system',
  'settings',
] as const;

type Tab = (typeof VALID_TABS)[number];

const readTabFromHash = (): Tab => {
  const hash = window.location.hash.replace('#', '');
  return (VALID_TABS as readonly string[]).includes(hash) ? (hash as Tab) : 'dashboard';
};

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<Tab>(readTabFromHash);
  const [search, setSearch] = useState('');

  // Keep the URL hash in step so a tab survives a refresh and can be linked to.
  useEffect(() => {
    if (isAuthenticated) window.location.hash = activeTab;
  }, [activeTab, isAuthenticated]);

  useEffect(() => {
    const onHashChange = () => setActiveTab(readTabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // The header filter is per-page; clear it when the page changes.
  useEffect(() => setSearch(''), [activeTab]);

  const stats = useFetch(() => insightsService.getStats(30), [isAuthenticated]);

  // The nav badge counts requests still waiting on a decision — the number an
  // administrator has to act on, not the size of the audit trail.
  const openPermissions = useFetch(
    () => permissionService.getPermissions({ status: 'pending' }),
    [isAuthenticated, activeTab]
  );

  if (!isAuthenticated) {
    return authView === 'register' ? (
      <RegisterPage onSwitchToLogin={() => setAuthView('login')} />
    ) : (
      <LoginPage onSwitchToRegister={() => setAuthView('register')} />
    );
  }

  const navCounts: Record<string, number> = {
    ...(stats.data && {
      properties: stats.data.properties.total,
      verifications: stats.data.verifications.total,
      users: stats.data.admins.total,
    }),
    ...(openPermissions.data && { permissions: openPermissions.data.length }),
  };

  const renderPage = () => {
    switch (activeTab) {
      case 'analytics':
        return <AnalyticsPage />;
      case 'properties':
        return <PropertiesPage search={search} />;
      case 'verifications':
        return <VerificationsPage search={search} />;
      case 'permissions':
        return <PermissionsPage search={search} />;
      case 'users':
        return <UsersPage search={search} />;
      case 'system':
        return <SystemPage />;
      case 'settings':
        return <SettingsPage />;
      case 'dashboard':
      default:
        return <Dashboard setActiveTab={setActiveTab as (t: string) => void} />;
    }
  };

  return (
    <AdminLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab as (t: string) => void}
      search={search}
      setSearch={setSearch}
      navCounts={navCounts}
    >
      {renderPage()}
    </AdminLayout>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
