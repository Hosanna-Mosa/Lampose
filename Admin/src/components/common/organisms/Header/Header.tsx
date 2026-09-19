import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { useTheme } from '../../../../context/ThemeContext';
import { useAuth } from '../../../../context/AuthContext';
import { Avatar } from '../../atoms/Avatar';
import { IconButton } from '../../atoms/IconButton';
import { cx } from '../../utils';
import { duration } from '../../../../lib/format';
import type { HealthEntity } from '../../../../api/types';
import { Banner } from '../../atoms/Banner';
import { Box } from '../../atoms/Box';
import { Inline } from '../../atoms/Inline';
import { Kbd } from '../../atoms/Kbd';
import { PlainButton } from '../../atoms/PlainButton';
import { PlainInput } from '../../atoms/PlainInput';
import { Text } from '../../atoms/Text';

interface HeaderProps {
  setMobileOpen: (open: boolean) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggleActivityPanel: () => void;
  activityCount: number;
  health: HealthEntity | null;
  healthError: string | null;
  onRefreshHealth: () => void;
  search: string;
  setSearch: (v: string) => void;
  /** Only pages backed by a record list expose the filter. */
  searchEnabled: boolean;
  searchPlaceholder: string;
  onOpenSettings: () => void;
}

/** Reports the backend's real state: reachable + database connected, degraded,
 *  or offline. Never a static "Ready". */
const HealthPill: React.FC<{
  health: HealthEntity | null;
  error: string | null;
  onRefresh: () => void;
}> = ({ health, error, onRefresh }) => {
  const connected = health?.database?.connected === true;
  const tone = connected
    ? { dot: 'bg-good', text: 'text-ink-2', label: 'Connected' }
    : health
      ? { dot: 'bg-warn', text: 'text-warn', label: 'Degraded' }
      : { dot: 'bg-crit', text: 'text-crit', label: 'Offline' };

  const detail = connected
    ? `${health?.database.name} · ${health?.latencyMs}ms · up ${duration(health?.uptimeSeconds ?? 0)}`
    : error || health?.database?.state || 'Backend unreachable';

  return (
    <PlainButton
      onClick={onRefresh}
      title={`API: ${tone.label} — ${detail}. Click to re-check.`}
      className="hidden md:flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-control border border-line hover:bg-surface-inset transition-colors"
    >
      <Inline className="relative flex size-1.5 shrink-0">
        {connected && (
          <Inline className="absolute inline-flex size-full rounded-full bg-good opacity-60 animate-ping" />
        )}
        <Inline className={cx('relative inline-flex size-1.5 rounded-full', tone.dot)} />
      </Inline>
      <Inline className={cx('text-label', tone.text)}>API {tone.label}</Inline>
      {connected && health?.latencyMs !== undefined && (
        <Inline className="text-label text-ink-3 tabular">{health.latencyMs}ms</Inline>
      )}
    </PlainButton>
  );
};

export const Header: React.FC<HeaderProps> = ({
  setMobileOpen,
  collapsed,
  setCollapsed,
  toggleActivityPanel,
  activityCount,
  health,
  healthError,
  onRefreshHealth,
  search,
  setSearch,
  searchEnabled,
  searchPlaceholder,
  onOpenSettings,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { identity, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!searchEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchEnabled]);

  return (
    <Banner className="sticky top-0 z-30 h-14 bg-surface/85 backdrop-blur-md border-b border-line px-3 lg:px-5 flex items-center gap-3">
      <IconButton
        icon={Menu}
        label="Open navigation"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden"
      />
      {collapsed && (
        <IconButton
          icon={PanelLeftOpen}
          label="Expand sidebar"
          onClick={() => setCollapsed(false)}
          className="hidden lg:grid"
        />
      )}

      {/* Filter — narrows the records on the active page */}
      {searchEnabled && (
        <Box className="relative flex-1 max-w-sm">
          <Search
            className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
            strokeWidth={1.75}
          />
          <PlainInput
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="field pl-9 pr-16 h-9"
          />
          {search ? (
            <PlainButton
              onClick={() => setSearch('')}
              aria-label="Clear filter"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
            >
              <X className="size-3.5" />
            </PlainButton>
          ) : (
            <Kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden md:block px-1.5 py-0.5 text-micro text-ink-3 bg-surface border border-line rounded">
              ⌘K
            </Kbd>
          )}
        </Box>
      )}

      <Box className="flex items-center gap-1.5 ml-auto">
        <HealthPill health={health} error={healthError} onRefresh={onRefreshHealth} />

        <IconButton
          icon={theme === 'light' ? Moon : Sun}
          label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          onClick={toggleTheme}
        />

        <PlainButton
          onClick={toggleActivityPanel}
          title="Recent activity"
          aria-label="Recent activity"
          className="relative grid place-items-center size-8 rounded-control text-ink-3 hover:text-ink hover:bg-surface-inset transition-colors"
        >
          <Bell className="size-4" strokeWidth={1.75} />
          {activityCount > 0 && (
            <Inline className="absolute top-1 right-1 size-1.5 rounded-full bg-brand ring-2 ring-surface" />
          )}
        </PlainButton>

        <Box className="w-px h-5 bg-line mx-1" />

        <Box className="relative">
          <PlainButton
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 h-8 pl-1 pr-2 rounded-control hover:bg-surface-inset transition-colors"
          >
            <Avatar name={identity?.name} src={identity?.avatar} size={26} />
            <Inline className="hidden md:block text-sm text-ink max-w-28 truncate">{identity?.name}</Inline>
            <ChevronDown className="size-3.5 text-ink-3 hidden sm:block" strokeWidth={2} />
          </PlainButton>

          {menuOpen && (
            <>
              <Box className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
              <Box className="absolute right-0 mt-1.5 w-60 z-50 bg-surface border border-line rounded-panel shadow-[var(--shadow-lg)] anim-fade-up overflow-hidden">
                <Box className="px-3.5 py-3 border-b border-line">
                  <Text className="text-body font-medium text-ink truncate">{identity?.name}</Text>
                  <Text className="text-label text-ink-3 truncate mt-0.5">{identity?.email}</Text>
                  <Text className="text-label text-brand-ink mt-1.5">{identity?.role}</Text>
                </Box>
                <Box className="p-1">
                  <PlainButton
                    onClick={() => {
                      onOpenSettings();
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 h-8 rounded-control text-body text-ink-2 hover:bg-surface-inset hover:text-ink transition-colors"
                  >
                    <Settings className="size-4" strokeWidth={1.75} /> Settings
                  </PlainButton>
                  <PlainButton
                    onClick={() => {
                      onRefreshHealth();
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 h-8 rounded-control text-body text-ink-2 hover:bg-surface-inset hover:text-ink transition-colors"
                  >
                    <RefreshCw className="size-4" strokeWidth={1.75} /> Re-check API health
                  </PlainButton>
                </Box>
                <Box className="p-1 border-t border-line">
                  <PlainButton
                    onClick={logout}
                    className="w-full flex items-center gap-2.5 px-2.5 h-8 rounded-control text-body text-crit hover:bg-crit-soft transition-colors"
                  >
                    <LogOut className="size-4" strokeWidth={1.75} /> Sign out
                  </PlainButton>
                </Box>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Banner>
  );
};
