import React, { useCallback, useEffect, useState } from 'react';
import { ActivityPanel } from '../../organisms/ActivityPanel';
import { Header } from '../../organisms/Header';
import { ALL_NAV_ITEMS, Sidebar } from '../../organisms/Sidebar';
import { insightsService } from '../../../../api/services/insightsService';
import { useFetch } from '../../../../lib/useFetch';
import { formatDateTime } from '../../../../lib/format';
import { useAuth } from '../../../../context/AuthContext';
import type { ApiResponse, ActivityEntity, HealthEntity } from '../../../../api/types';
import { Box } from '../../atoms/Box';
import { Footer } from '../../atoms/Footer';
import { Inline } from '../../atoms/Inline';
import { Main } from '../../atoms/Main';
import { Nav } from '../../atoms/Nav';
import { Text } from '../../atoms/Text';

interface AdminLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  search: string;
  setSearch: (v: string) => void;
  /** Record counts shown beside the nav items. */
  navCounts: Record<string, number>;
}

const HEALTH_POLL_MS = 60_000;

/** Pages backed by a record list get the header filter. */
const SEARCH_PLACEHOLDERS: Record<string, string> = {
  properties: 'Filter by name, place, owner or agent',
  verifications: 'Filter by mobile, token, property or error',
  'onboarding-team': 'Filter by employee email',
  users: 'Filter by name, email or role',
  'visit-requests': 'Filter by property, customer or owner mobile',
  'scriper-users': 'Filter by name, email or role',
  'scraper-jobs': 'Filter by job name, query or location',
  'scraper-leads': 'Filter by business, city, category, phone or email',
  products: 'Filter by name or description',
  'food-orders': "Find an order by number, diner's phone or Razorpay id",
  'food-payouts': 'Find by restaurant, payout id, account or reference',
  /* The restaurant console's own two searchable lists. */
  'restaurant-orders': "Find an order by number, diner's name or phone",
  'restaurant-menu': 'Filter dishes by name, section or tag',
};

/* Analytics and Earnings are deliberately absent from the list above: both
   are aggregates over a period rather than record lists, and a filter box
   that narrowed the table but not the totals beside it would put two
   disagreeing readings of the same period on one screen. Earnings has its
   own date range, which is the filter that page actually needs. */

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  search,
  setSearch,
  navCounts,
}) => {
  /*
   * Which console this is.
   *
   * The activity feed below reads `/admin/activity`, which answers to a STAFF
   * token and to nothing else. Asking for it on a restaurant owner's session
   * returns 401, `axiosInstance` turns every 401 into an `api:unauthorized`
   * event, and `AuthContext` signs the session out on that event — so an
   * unguarded fetch here would throw an owner straight back to the login
   * screen a second after they reached the console, with no visible cause.
   *
   * `/health` is public and is asked for either way: the footer's "is the
   * backend up" line is as useful to a kitchen as it is to an administrator.
   */
  const { kind } = useAuth();
  const isStaff = kind !== 'restaurant';

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('admin_nav_collapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const [health, setHealth] = useState<HealthEntity | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('admin_nav_collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  const checkHealth = useCallback(async () => {
    const res = await insightsService.getHealth();
    setHealth(res.data);
    setHealthError(res.success ? null : res.message || 'Backend unreachable.');
  }, []);

  useEffect(() => {
    checkHealth();
    const id = setInterval(checkHealth, HEALTH_POLL_MS);
    return () => clearInterval(id);
  }, [checkHealth]);

  /* Called unconditionally — a hook cannot be skipped — but resolved without
     a request on an owner's session. An empty list renders no bell count and
     the panel is not mounted at all below. */
  const noActivity = async (): Promise<ApiResponse<ActivityEntity[]>> => ({
    success: true,
    status: 200,
    data: [],
  });
  const activity = useFetch(() => (isStaff ? insightsService.getActivity(20) : noActivity()), [
    isStaff,
  ]);

  /* Looked up across BOTH consoles' nav rows, so the breadcrumb names a
     restaurant page as readily as a staff one. */
  const currentNav = ALL_NAV_ITEMS.find((item) => item.id === activeTab);

  return (
    <Box className="min-h-screen bg-canvas">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        counts={navCounts}
      />

      <Box
        className={`flex flex-col min-h-screen transition-[margin] duration-200 ease-out ${
          collapsed ? 'lg:ml-16' : 'lg:ml-60'
        }`}
      >
        <Header
          setMobileOpen={setMobileOpen}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          toggleActivityPanel={() => setActivityOpen((v) => !v)}
          activityCount={activity.data?.length ?? 0}
          health={health}
          healthError={healthError}
          onRefreshHealth={checkHealth}
          search={search}
          setSearch={setSearch}
          searchEnabled={activeTab in SEARCH_PLACEHOLDERS}
          searchPlaceholder={SEARCH_PLACEHOLDERS[activeTab] ?? 'Filter records'}
          onOpenSettings={() => setActiveTab('settings')}
        />

        <Main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
          <Nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 text-label text-ink-3">
            <Inline>{isStaff ? 'Admin' : 'Restaurant'}</Inline>
            <Inline aria-hidden>/</Inline>
            <Inline className="text-ink-2">{currentNav?.label ?? 'Overview'}</Inline>
          </Nav>
          {children}
        </Main>

        <Footer className="border-t border-line px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-2">
          <Text className="text-label text-ink-3">
            © {new Date().getFullYear()} Lampose · {isStaff ? 'Admin Console' : 'Restaurant Console'}
          </Text>
          <Text className="text-label text-ink-3 tabular">
            {health?.database?.connected
              ? `${health.database.name} · checked ${formatDateTime(health.timestamp)}`
              : 'Database status unavailable'}
          </Text>
        </Footer>
      </Box>

      {/* The platform activity feed is a staff view of every record in the
          console. It is not narrowed for an owner — it is simply not theirs,
          and the endpoint behind it refuses their token. */}
      {isStaff && (
        <ActivityPanel
          open={activityOpen}
          onClose={() => setActivityOpen(false)}
          items={activity.data ?? []}
          loading={activity.loading}
          error={activity.error}
          onReload={activity.reload}
        />
      )}
    </Box>
  );
};
