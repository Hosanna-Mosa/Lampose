import React, { useEffect, useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminLayout } from './components/layout/AdminLayout';
import { Dashboard } from './pages/Dashboard';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { WebAnalyticsPage } from './pages/WebAnalyticsPage';
import { UsersPage } from './pages/UsersPage';
import { PropertiesPage } from './pages/PropertiesPage';
import { VerificationsPage } from './pages/VerificationsPage';
import { OnboardingTeamPage } from './pages/OnboardingTeamPage';
import { PermissionsPage } from './pages/PermissionsPage';
import { MessagesPage } from './pages/MessagesPage';
import { SystemPage } from './pages/SystemPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VisitRequestsPage } from './pages/VisitRequestsPage';
import { ScriperUsersPage } from './pages/ScriperUsersPage';
import { ScrapeJobsPage } from './pages/ScrapeJobsPage';
import { ScrapedLeadsPage } from './pages/ScrapedLeadsPage';
import { ProductsPage } from './pages/ProductsPage';
import { insightsService } from './api/services/insightsService';
import { permissionService } from './api/services/permissionService';
import { useFetch } from './lib/useFetch';

const VALID_TABS = [
  'dashboard',
  'analytics',
  'web-analytics',
  'properties',
  'verifications',
  'onboarding-team',
  'permissions',
  'users',
  'messages',
  'system',
  'settings',
  'visit-requests',
  'scriper-users',
  'scraper-jobs',
  'scraper-leads',
  'products',
] as const;

type Tab = (typeof VALID_TABS)[number];

/** Full-database CRUD — same "Database" nav group Sidebar.tsx hides from
 *  anyone but a Super Admin. Gated again here so a bookmarked/typed hash
 *  can't reach the page even though it's not in the nav. The backend is the
 *  real guard; this just keeps the console's own UI honest with it. */
const SUPER_ADMIN_TABS = new Set<Tab>([
  'visit-requests',
  'scriper-users',
  'scraper-jobs',
  'scraper-leads',
  'products',
]);

const readTabFromHash = (): Tab => {
  const hash = window.location.hash.replace('#', '');
  return (VALID_TABS as readonly string[]).includes(hash) ? (hash as Tab) : 'dashboard';
};

const AppContent: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<Tab>(readTabFromHash);
  const [search, setSearch] = useState('');

  const isSuperAdmin = user?.role === 'Super Admin';

  // Keep the URL hash in step so a tab survives a refresh and can be linked to.
  useEffect(() => {
    if (isAuthenticated) window.location.hash = activeTab;
  }, [activeTab, isAuthenticated]);

  useEffect(() => {
    const onHashChange = () => setActiveTab(readTabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // A bookmarked or hand-typed hash could still land a non-Super-Admin on one
  // of the database-control pages even though Sidebar.tsx never links to it.
  // The backend already refuses those requests; this just keeps the console's
  // own UI from showing a page whose every action would 403.
  useEffect(() => {
    if (isAuthenticated && SUPER_ADMIN_TABS.has(activeTab) && !isSuperAdmin) {
      setActiveTab('dashboard');
    }
  }, [isAuthenticated, activeTab, isSuperAdmin]);

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
      case 'web-analytics':
        return <WebAnalyticsPage />;
      case 'properties':
        return <PropertiesPage search={search} />;
      case 'verifications':
        return <VerificationsPage search={search} />;
      case 'onboarding-team':
        return <OnboardingTeamPage search={search} />;
      case 'permissions':
        return <PermissionsPage search={search} />;
      case 'users':
        return <UsersPage search={search} />;
      case 'messages':
        return <MessagesPage />;
      case 'system':
        return <SystemPage />;
      case 'settings':
        return <SettingsPage />;
      case 'visit-requests':
        return isSuperAdmin ? <VisitRequestsPage search={search} /> : <Dashboard setActiveTab={setActiveTab as (t: string) => void} />;
      case 'scriper-users':
        return isSuperAdmin ? <ScriperUsersPage search={search} /> : <Dashboard setActiveTab={setActiveTab as (t: string) => void} />;
      case 'scraper-jobs':
        return isSuperAdmin ? <ScrapeJobsPage search={search} /> : <Dashboard setActiveTab={setActiveTab as (t: string) => void} />;
      case 'scraper-leads':
        return isSuperAdmin ? <ScrapedLeadsPage search={search} /> : <Dashboard setActiveTab={setActiveTab as (t: string) => void} />;
      case 'products':
        return isSuperAdmin ? <ProductsPage search={search} /> : <Dashboard setActiveTab={setActiveTab as (t: string) => void} />;
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
