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
import { FoodRestaurantsPage } from './pages/FoodRestaurantsPage';
import { insightsService } from './api/services/insightsService';
import { permissionService } from './api/services/permissionService';
import { visibleGroupsFor } from './components/layout/Sidebar';
import type { UserEntity } from './api/types';
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
  'food-restaurants',
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

/**
 * A tab a role can actually open, derived from the SAME nav definition the
 * sidebar renders from.
 *
 * Deriving it rather than keeping a second list is the point: a group added to
 * `NAV_GROUPS` later is gated here automatically, where a hand-maintained copy
 * would be one forgotten edit away from letting a typed hash through. The
 * backend is the real guard either way — this keeps the console's own UI
 * honest with it.
 */
const tabAllowedFor = (tab: Tab, role?: UserEntity['role']): boolean =>
  visibleGroupsFor(role).some((group) => group.items.some((item) => item.id === tab));

/* A Food Admin has no Dashboard in their nav, so sending them there on a
   refused tab would strand them on a page their sidebar cannot navigate back
   to. They land on their own queue instead. */
const homeTabFor = (role?: UserEntity['role']): Tab =>
  role === 'Food Admin' ? 'food-restaurants' : 'dashboard';

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
    if (!isAuthenticated) return;
    if (SUPER_ADMIN_TABS.has(activeTab) && !isSuperAdmin) {
      setActiveTab('dashboard');
      return;
    }
    /* Any other role-gated tab — today the Food group, tomorrow whatever is
       added to NAV_GROUPS. `dashboard` itself is never gated, so this cannot
       loop. */
    if (!tabAllowedFor(activeTab, user?.role) && activeTab !== 'dashboard') {
      setActiveTab(homeTabFor(user?.role));
    }
  }, [isAuthenticated, activeTab, isSuperAdmin, user?.role]);

  // The header filter is per-page; clear it when the page changes.
  useEffect(() => setSearch(''), [activeTab]);

  /* A Food Admin's nav has no Dashboard, so the default landing tab moves to
     the one page they do have. Only on first load — it must not fight a tab
     they have chosen. */
  useEffect(() => {
    if (isAuthenticated && user?.role === 'Food Admin' && activeTab === 'dashboard') {
      setActiveTab('food-restaurants');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.role]);

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
      case 'food-restaurants':
        return tabAllowedFor('food-restaurants', user?.role) ? (
          <FoodRestaurantsPage search={search} />
        ) : (
          <Dashboard setActiveTab={setActiveTab as (t: string) => void} />
        );
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
