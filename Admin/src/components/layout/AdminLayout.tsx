import React, { useCallback, useEffect, useState } from 'react';
import { Sidebar, NAV_ITEMS } from './Sidebar';
import { Header } from './Header';
import { ActivityPanel } from './ActivityPanel';
import { insightsService } from '../../api/services/insightsService';
import { useFetch } from '../../lib/useFetch';
import { formatDateTime } from '../../lib/format';
import type { HealthEntity } from '../../api/types';

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
};

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  search,
  setSearch,
  navCounts,
}) => {
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

  const activity = useFetch(() => insightsService.getActivity(20), []);

  const currentNav = NAV_ITEMS.find((item) => item.id === activeTab);

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        counts={navCounts}
      />

      <div
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

        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
          <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 text-label text-ink-3">
            <span>Admin</span>
            <span aria-hidden>/</span>
            <span className="text-ink-2">{currentNav?.label ?? 'Overview'}</span>
          </nav>
          {children}
        </main>

        <footer className="border-t border-line px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-label text-ink-3">
            © {new Date().getFullYear()} Lampose · Admin Console
          </p>
          <p className="text-label text-ink-3 tabular">
            {health?.database?.connected
              ? `${health.database.name} · checked ${formatDateTime(health.timestamp)}`
              : 'Database status unavailable'}
          </p>
        </footer>
      </div>

      <ActivityPanel
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        items={activity.data ?? []}
        loading={activity.loading}
        error={activity.error}
        onReload={activity.reload}
      />
    </div>
  );
};
