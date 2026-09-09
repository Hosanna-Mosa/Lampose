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
import { FoodOrdersPage } from './pages/FoodOrdersPage';
import { DriversPage } from './pages/DriversPage';
import { ZonesPage } from './pages/ZonesPage';
import { MonitorPage } from './pages/MonitorPage';
import { PartnerPayoutsPage } from './pages/PartnerPayoutsPage';
import { RefundsPage } from './pages/RefundsPage';
import { SupportPage } from './pages/SupportPage';
import { insightsService } from './api/services/insightsService';
import { permissionService } from './api/services/permissionService';
import { foodOrderService } from './api/services/foodOrderService';
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
  'food-orders',
  'drivers',
  'zones',
  'support',
  'monitor',
  'partner-payouts',
  'refunds',
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

/* A narrow role has no Dashboard in its nav, so sending one there on a refused
   tab would strand them on a page their sidebar cannot navigate back to. Each
   lands on its own queue instead. */
const homeTabFor = (role?: UserEntity['role']): Tab => {
  if (role === 'Food Admin') return 'food-restaurants';
  if (role === 'Support') return 'support';
  return 'dashboard';
};

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

  /* A narrow role's nav has no Dashboard, so the default landing tab moves to
     the one page they do have. Only on first load — it must not fight a tab
     they have chosen. `homeTabFor` is the single source of that mapping, so a
     role added there lands correctly here without a second edit. */
  useEffect(() => {
    if (!isAuthenticated || activeTab !== 'dashboard') return;
    const home = homeTabFor(user?.role);
    if (home !== 'dashboard') setActiveTab(home);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.role]);

  const stats = useFetch(() => insightsService.getStats(30), [isAuthenticated]);

  // The nav badge counts requests still waiting on a decision — the number an
  // administrator has to act on, not the size of the audit trail.
  const openPermissions = useFetch(
    () => permissionService.getPermissions({ status: 'pending' }),
    [isAuthenticated, activeTab]
  );

  /* The food-order badge: orders that need a person, not the size of the day's
     trade. Read on the same terms as the permissions badge above — refetched
     when the page changes rather than on a timer of its own, because this
     console does not poll for record counts and a second mechanism beside the
     one it has is how the two drift apart. The number is deduplicated
     server-side, so an order that is both stuck and owed a refund is one.

     This is ALSO the strip of counts the page itself draws above its queue,
     handed down rather than fetched again. The page used to keep its own copy,
     which meant a refund refreshed the strip and left the badge showing the
     old number until somebody changed tab — two readings of one fact, one of
     them stale, three feet apart on the same screen. One request, one number,
     and `reload` is the same function both of them refresh with. */
  const foodOrderCounts = useFetch(
    () => foodOrderService.counts(),
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
    ...(foodOrderCounts.data && {
      'food-orders': foodOrderCounts.data.needsHuman,
    }),
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
      case 'food-orders':
        return tabAllowedFor('food-orders', user?.role) ? (
          <FoodOrdersPage
            search={search}
            counts={foodOrderCounts.data}
            reloadCounts={foodOrderCounts.reload}
          />
        ) : (
          <Dashboard setActiveTab={setActiveTab as (t: string) => void} />
        );
      case 'drivers':
        return tabAllowedFor('drivers', user?.role) ? (
          <DriversPage search={search} />
        ) : (
          <Dashboard setActiveTab={setActiveTab as (t: string) => void} />
        );
      case 'zones':
        return tabAllowedFor('zones', user?.role) ? (
          <ZonesPage search={search} />
        ) : (
          <Dashboard setActiveTab={setActiveTab as (t: string) => void} />
        );
      /* Every signed-in administrator may READ Monitor — it is the operational
         picture of the business. The page itself hides the commission field
         below Admin and the Withdraw button below Super Admin, and
         `monitor.admin.routes.js` refuses both regardless of what is drawn. */
      case 'monitor':
        return <MonitorPage search={search} role={user?.role} />;
      /* Same reasoning as Monitor above: any signed-in administrator may READ
         the queue, and the page hides Send money below Super Admin, which
         `partnerPayout.admin.routes.js` enforces regardless of what is drawn. */
      case 'partner-payouts':
        return <PartnerPayoutsPage search={search} role={user?.role} />;
      /* Same shape as Partner Payouts: anyone may read the queue; only a Super
         Admin sees the Mark-as-refunded control, and the server refuses the
         write regardless. */
      case 'refunds':
        return <RefundsPage search={search} role={user?.role} />;
      case 'support':
        return tabAllowedFor('support', user?.role) ? (
          <SupportPage search={search} />
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
