import React from 'react';
import {
  BarChart3,
  Building2,
  ChevronsLeft,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Server,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from './Avatar';
import { cx, IconButton } from '../ui';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    heading: 'Records',
    items: [
      { id: 'properties', label: 'Properties', icon: Building2 },
      { id: 'verifications', label: 'Verifications', icon: ShieldCheck },
      { id: 'permissions', label: 'Permissions', icon: KeyRound },
      { id: 'users', label: 'Administrators', icon: Users },
    ],
  },
  {
    heading: 'Platform',
    items: [
      { id: 'system', label: 'System', icon: Server },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  /** Live record counts keyed by nav id, from the stats endpoint. */
  counts?: Record<string, number>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  counts = {},
}) => {
  const { user, logout } = useAuth();

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    if (mobileOpen) setMobileOpen(false);
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[rgb(9_12_20/0.5)] backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cx(
          'fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-surface border-r border-line',
          'transition-[width,transform] duration-200 ease-out',
          collapsed ? 'w-16' : 'w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand */}
        <div className={cx('h-14 flex items-center border-b border-line shrink-0', collapsed ? 'justify-center px-2' : 'px-4 gap-2.5')}>
          <span className="grid place-items-center size-8 rounded-control bg-brand text-white shrink-0">
            <span className="text-body font-semibold leading-none">L</span>
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-ink leading-tight truncate">Lampose</p>
              <p className="text-micro uppercase text-ink-3 leading-tight">Admin Console</p>
            </div>
          )}
          {!collapsed && (
            <IconButton
              icon={ChevronsLeft}
              label="Collapse sidebar"
              onClick={() => setCollapsed(true)}
              className="hidden lg:grid -mr-1"
            />
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading}>
              {!collapsed && (
                <p className="text-micro uppercase text-ink-3 px-2.5 mb-1.5">{group.heading}</p>
              )}
              <ul className="space-y-0.5 list-none m-0 p-0">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  const count = counts[item.id];
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => handleNavClick(item.id)}
                        title={collapsed ? item.label : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        className={cx(
                          'w-full flex items-center rounded-control transition-colors duration-120 h-9',
                          collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
                          isActive
                            ? 'bg-brand-soft text-brand-ink font-medium'
                            : 'text-ink-2 hover:bg-surface-inset hover:text-ink'
                        )}
                      >
                        <Icon className="size-4 shrink-0" strokeWidth={isActive ? 2 : 1.75} />
                        {!collapsed && (
                          <>
                            <span className="text-body truncate flex-1 text-left">{item.label}</span>
                            {typeof count === 'number' && (
                              <span
                                className={cx(
                                  'text-label tabular shrink-0',
                                  isActive ? 'text-brand-ink' : 'text-ink-3'
                                )}
                              >
                                {count}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Signed-in account */}
        <div className={cx('border-t border-line shrink-0', collapsed ? 'p-2' : 'p-2.5')}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-1.5">
              <Avatar name={user?.name} src={user?.avatar} size={28} />
              <IconButton icon={LogOut} label="Sign out" onClick={logout} tone="danger" />
            </div>
          ) : (
            <div className="flex items-center gap-2.5 p-1.5 rounded-control">
              <Avatar name={user?.name} src={user?.avatar} size={30} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink truncate leading-tight">
                  {user?.name || 'Administrator'}
                </p>
                <p className="text-label text-ink-3 truncate leading-tight">{user?.role}</p>
              </div>
              <IconButton icon={LogOut} label="Sign out" onClick={logout} tone="danger" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
