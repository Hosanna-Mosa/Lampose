import React, { useEffect, useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { visibleGroupsFor } from './components/common/organisms/Sidebar';
import { AdminLayout } from './components/common/templates/AdminLayout';
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
import { FoodPayoutsPage } from './pages/FoodPayoutsPage';
import { DriversPage } from './pages/DriversPage';
import { MonitorPage } from './pages/MonitorPage';
import { PartnerPayoutsPage } from './pages/PartnerPayoutsPage';
import { RefundsPage } from './pages/RefundsPage';
import { SupportPage } from './pages/SupportPage';
import { RestaurantDashboard } from './pages/restaurant/RestaurantDashboard';
import { RestaurantOrdersPage } from './pages/restaurant/RestaurantOrdersPage';
import { OrderLinkPage } from './pages/restaurant/OrderLinkPage';
import { RestaurantMenuPage } from './pages/restaurant/RestaurantMenuPage';
import { RestaurantShopPage } from './pages/restaurant/RestaurantShopPage';
import { RestaurantAnalyticsPage } from './pages/restaurant/RestaurantAnalyticsPage';
import { RestaurantEarningsPage } from './pages/restaurant/RestaurantEarningsPage';
import { insightsService } from './api/services/insightsService';
import { permissionService } from './api/services/permissionService';
import { foodOrderService } from './api/services/foodOrderService';
import { foodAdminService } from './api/services/foodAdminService';
import { driverAdminService } from './api/services/driverAdminService';
import { foodPayoutService } from './api/services/foodPayoutService';
import { restaurantAdminService } from './api/services/restaurantAdminService';
import type { ApiResponse, UserEntity } from './api/types';
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
  'food-payouts',
  'drivers',
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

/* ══════════════════════════════════════════════════════════════════════════
   The OTHER console.

   A restaurant owner signs in through the same login screen and lands here
   instead of in `AppContent`. It is a separate component rather than more
   branches inside that one, and the reason is that almost nothing is shared:
   `AppContent` opens with four requests to `/admin/*` — stats, the pending
   permissions badge, the restaurant queue, the rider queue — and every one of
   them answers to a STAFF token. On an owner's session each would return 401,
   `axiosInstance` turns a 401 into `api:unauthorized`, and `AuthContext` signs
   the session out on that event. An owner would be thrown back to the login
   screen a second after reaching the console, with nothing on screen to say
   why.

   What IS shared is the shell: `AdminLayout`, the sidebar, the header, the
   design system. `AdminLayout` reads the session kind itself and drops the
   staff-only activity feed on this side.

   The tabs are prefixed `restaurant-` so the two consoles' hashes cannot
   collide, and a hash from the wrong console is bounced to this one's home
   rather than rendering a page whose every request would be refused.
   ══════════════════════════════════════════════════════════════════════════ */
const RESTAURANT_TABS = [
  'restaurant-dashboard',
  'restaurant-orders',
  'restaurant-menu',
  'restaurant-analytics',
  'restaurant-earnings',
  'restaurant-profile',
] as const;

type RestaurantTab = (typeof RESTAURANT_TABS)[number];

/**
 * Where to land, from either spelling of a link to one order.
 *
 *   ?order=LO151171                 the WhatsApp button's URL
 *   #restaurant-orders/LO151171     the hash form
 *
 * ## Why the button uses a query param and not the hash
 *
 * A WhatsApp URL button is a FIXED prefix plus a variable suffix, so either
 * would fit. The query wins because a fragment is the part of a URL that
 * link handlers mangle: WhatsApp, and the in-app browsers that open from
 * it, are not a place to find out whether `#` survives a round trip. A
 * query param is sent to the server and is visible to the page under every
 * client that has ever loaded a URL.
 *
 * The hash form is kept because it is what the console itself writes as you
 * move between tabs, and because a link already sent should not stop
 * working.
 *
 * An unknown tab falls back to the dashboard, and a focus segment on a page
 * with no use for one is ignored.
 */
const readRestaurantRoute = (): { tab: RestaurantTab; focus: string } => {
  const raw = window.location.hash.replace(/^#/, '');
  const [hashTab, hashFocus = ''] = raw.split('/');

  /* The query wins when both are present: a fresh link beats whatever the
     hash was left on by the previous session. */
  const queryOrder = new URLSearchParams(window.location.search).get('order') || '';

  const tab = queryOrder
    ? 'restaurant-orders'
    : ((RESTAURANT_TABS as readonly string[]).includes(hashTab)
      ? (hashTab as RestaurantTab)
      : 'restaurant-dashboard');

  return { tab, focus: queryOrder || decodeURIComponent(hashFocus) };
};

const RestaurantConsole: React.FC = () => {
  const [activeTab, setActiveTab] = useState<RestaurantTab>(() => readRestaurantRoute().tab);
  const [search, setSearch] = useState('');
  /* The order a link asked to open, read once at mount and once per hash
     change. Cleared by the page when it has opened it, so closing the
     detail and clicking about does not keep re-opening the same order. */
  const [focusOrder, setFocusOrder] = useState(() => readRestaurantRoute().focus);

  /*
   * The hash follows the tab — but writing it must not erase a focus
   * segment that has only just arrived. Landing on
   * `#restaurant-orders/LO151171` sets the tab to `restaurant-orders`, and
   * an unconditional write of the bare tab would immediately rewrite the
   * URL and drop the order before the page had read it. So the tab is
   * written only when it actually differs from what the hash already says.
   */
  /*
   * The query param is consumed once and removed.
   *
   * Left in place, every refresh — and every tab change, which rewrites the
   * hash beside it — would reopen the same order, and an owner who closed
   * it deliberately would find it back. `replaceState` rather than a hash
   * write, so it leaves no entry in history for Back to land on.
   *
   * Runs before the tab/hash effect below so the two do not fight over the
   * address bar on the first render after a link.
   */
  useEffect(() => {
    if (!window.location.search.includes('order=')) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('order');
    /* The hash carries the destination from here on, so it is set in the
       same rewrite — otherwise the address bar would read as the dashboard
       while the orders page is on screen. */
    url.hash = 'restaurant-orders';
    window.history.replaceState(null, '', url.toString());
  }, []);

  useEffect(() => {
    if (readRestaurantRoute().tab !== activeTab) window.location.hash = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const onHashChange = () => {
      const next = readRestaurantRoute();
      setActiveTab(next.tab);
      if (next.focus) setFocusOrder(next.focus);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // The header filter is per-page; clear it when the page changes.
  useEffect(() => setSearch(''), [activeTab]);

  /*
   * The one badge on this nav: orders waiting to be accepted.
   *
   * Read from `/summary`, which is the same request the dashboard draws its
   * tiles from — one number, one source. Refetched when the tab changes
   * rather than on a timer of its own: the Orders page refreshes ITSELF every
   * twenty seconds and hands this back through `reloadCounts`, so a second
   * timer here would be two mechanisms answering one question, which is how
   * two readings of one fact end up disagreeing on the same screen.
   */
  const summary = useFetch(() => restaurantAdminService.summary(), [activeTab]);

  const waiting = summary.data?.live.newOrders ?? 0;
  const navCounts: Record<string, number> = {
    /* Only when something is actually waiting. A nav row reading "0" is a row
       that has to be read before it can be dismissed, on every screen, for
       ever — and being noticed is the whole job of this one. */
    ...(waiting > 0 ? { 'restaurant-orders': waiting } : {}),
  };

  const renderPage = () => {
    switch (activeTab) {
      case 'restaurant-orders':
        return (
          <RestaurantOrdersPage
            search={search}
            reloadCounts={summary.reload}
            focusOrder={focusOrder}
            onFocusHandled={() => setFocusOrder('')}
          />
        );
      case 'restaurant-menu':
        return <RestaurantMenuPage search={search} />;
      /* Neither of these takes `search`: both are aggregates over a period,
         and Earnings carries the date range that is its real filter. */
      case 'restaurant-analytics':
        return <RestaurantAnalyticsPage />;
      case 'restaurant-earnings':
        return <RestaurantEarningsPage />;
      case 'restaurant-profile':
        return <RestaurantShopPage />;
      case 'restaurant-dashboard':
      default:
        return <RestaurantDashboard setActiveTab={setActiveTab as (t: string) => void} />;
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

const AppContent: React.FC = () => {
  /* Only ever mounted for a STAFF session — `Root` below decides that, and it
     matters: every request this component opens with goes to `/admin/*` and
     would be refused for anybody else. `isAuthenticated` stays in the fetch
     deps because it is the signal those loaders were written against. */
  const { isAuthenticated, user } = useAuth();
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

  /*
   * The two APPROVAL badges: applications and riders waiting for a person.
   *
   * They answer the question somebody opens this console to ask — "is there
   * anything new for me?" — which until now had no answer until you clicked
   * into each queue and counted what was there.
   *
   * `limit: 1`, and the count is taken from `counts` rather than from the rows.
   * Both endpoints compute `counts` as an UNFILTERED `$group` over the whole
   * collection, in parallel with the page rather than from it, so one row
   * carries the true tally and the badge does not drag a hundred applications
   * across the wire to render a number.
   *
   * The loader is wrapped because `useFetch` keeps `res.data` and nothing else
   * — `counts` would be dropped on the way through. Mapping it into `data`
   * here means the badge reads one number rather than reaching into a shape
   * the hook never promised to keep.
   *
   * Refetched on tab change, deliberately NOT on a timer. This console does
   * not poll for record counts, and a second mechanism beside the one it has
   * is how two readings of one fact end up disagreeing three feet apart on the
   * same screen — the note above `foodOrderCounts` records where that was
   * learnt. A badge one click stale is right often enough; a badge that
   * disagrees with the queue it points at is worse than no badge.
   */
  /* Asked for only by a role whose nav actually has the row, and decided by
     `tabAllowedFor` — the SAME derivation the sidebar and the tab router use,
     rather than a third copy of the role list to keep in step. A Support agent
     has no Food group, so asking would be a 403 on every tab change for a
     badge they would never see. `zero` is a real answer rather than an error,
     so a refused role renders no badge instead of a broken one. */
  const zero = (): ApiResponse<number> => ({ success: true, status: 200, data: 0 });

  const pendingRestaurants = useFetch<number>(
    async () => {
      if (!tabAllowedFor('food-restaurants', user?.role)) return zero();
      const res = await foodAdminService.getRestaurants({ status: 'pending', limit: 1 });
      return { ...res, data: res.counts?.pending ?? 0 };
    },
    [isAuthenticated, activeTab, user?.role]
  );

  /* Restaurants waiting to be paid. Same terms as the two approval badges
     above: asked for only by a role whose nav actually has the row, decided
     by `tabAllowedFor` rather than a third copy of the role list, and
     refetched on tab change rather than on a timer of its own. */
  const pendingPayouts = useFetch<number>(
    async () => {
      if (!tabAllowedFor('food-payouts', user?.role)) return zero();
      const res = await foodPayoutService.list({ status: 'pending', limit: 1 });
      return { ...res, data: res.data?.counts?.pending ?? 0 };
    },
    [isAuthenticated, activeTab, user?.role]
  );

  const pendingDrivers = useFetch<number>(
    async () => {
      if (!tabAllowedFor('drivers', user?.role)) return zero();
      const res = await driverAdminService.getDrivers({ status: 'pending', limit: 1 });
      return { ...res, data: res.counts?.pending ?? 0 };
    },
    [isAuthenticated, activeTab, user?.role]
  );

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
    /* Only when something is actually waiting. A nav row reading "0" is a row
       that has to be read before it can be dismissed, on every screen, for
       ever — and being noticed is the whole job of these two. An absent key
       renders no badge; `Sidebar.tsx` tests for a number rather than for
       truthiness, so a genuine zero elsewhere still shows if it wants to. */
    ...(pendingRestaurants.data ? { 'food-restaurants': pendingRestaurants.data } : {}),
    ...(pendingDrivers.data ? { drivers: pendingDrivers.data } : {}),
    ...(pendingPayouts.data ? { 'food-payouts': pendingPayouts.data } : {}),
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
      /* Reading is open to any administrator on the backend, exactly as the
         order queue is; the page hides Mark paid and Refuse below Super
         Admin and `foodPayoutAdmin.routes.js` refuses both regardless of
         what is drawn. It sits in the Food nav group, so a role without
         that group is bounced by `tabAllowedFor` as usual. */
      case 'food-payouts':
        return tabAllowedFor('food-payouts', user?.role) ? (
          <FoodPayoutsPage search={search} role={user?.role} />
        ) : (
          <Dashboard setActiveTab={setActiveTab as (t: string) => void} />
        );
      case 'drivers':
        return tabAllowedFor('drivers', user?.role) ? (
          <DriversPage search={search} />
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

/**
 * Which of the three screens this browser is looking at.
 *
 * Signed out, the staff console, or the restaurant console — decided here
 * rather than inside `AppContent`, and that placement is the whole point. A
 * branch inside `AppContent` would be too late: its four opening requests are
 * `useFetch` calls, hooks run before any early return can stop them, and all
 * four go to `/admin/*`. On a restaurant owner's session each would answer
 * 401, `axiosInstance` turns a 401 into `api:unauthorized`, and `AuthContext`
 * signs the session out on that event — so an owner would be bounced to the
 * login screen a moment after reaching the console. Choosing the component
 * before it mounts is what stops those requests from ever being made.
 */
const Root: React.FC = () => {
  const { isAuthenticated, kind } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  if (!isAuthenticated) {
    return authView === 'register' ? (
      <RegisterPage onSwitchToLogin={() => setAuthView('login')} />
    ) : (
      <LoginPage onSwitchToRegister={() => setAuthView('register')} />
    );
  }

  return kind === 'restaurant' ? <RestaurantConsole /> : <AppContent />;
};

/**
 * The link in the restaurant's "you have a new order" WhatsApp: `?order=LO…&token=…`.
 *
 * Both parts, or it is not one. A link with only `?order=` is the older,
 * sign-in kind (and what the link falls back to when the server has no signing
 * secret), and goes through the ordinary route below.
 */
const readOrderLink = (): { orderNumber: string; token: string } | null => {
  const params = new URLSearchParams(window.location.search);
  const orderNumber = (params.get('order') || '').trim();
  const token = (params.get('token') || '').trim();
  return orderNumber && token ? { orderNumber, token } : null;
};

export default function App() {
  const link = readOrderLink();

  /*
   * A link with its proof skips the sign-in gate altogether — and the
   * `AuthProvider` with it, which is the point rather than an economy.
   *
   * The owner tapping it is often in a phone's in-app browser that keeps nothing
   * between taps, so a route that starts from "are you signed in" asks for the
   * password on every order. This page needs no session (the token proves the
   * one order it is for), and leaving the provider out means it cannot read a
   * stored one, write one, or — through a stray 401 — sign somebody out of the
   * console they are using in another tab.
   */
  if (link) {
    return (
      <ThemeProvider>
        <OrderLinkPage orderNumber={link.orderNumber} token={link.token} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ThemeProvider>
  );
}
