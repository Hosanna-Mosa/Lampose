import React from 'react';
import {
  ChevronsLeft,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { Avatar } from '../../atoms/Avatar';
import { IconButton } from '../../atoms/IconButton';
import { cx } from '../../utils';
import { visibleGroupsFor } from './Sidebar.nav';
import { Aside } from '../../atoms/Aside';
import { Box } from '../../atoms/Box';
import { Inline } from '../../atoms/Inline';
import { List } from '../../atoms/List';
import { ListItem } from '../../atoms/ListItem';
import { Nav } from '../../atoms/Nav';
import { PlainButton } from '../../atoms/PlainButton';
import { Text } from '../../atoms/Text';

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
        <Box
          className="fixed inset-0 z-40 bg-[rgb(9_12_20/0.5)] backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <Aside
        className={cx(
          'fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-surface border-r border-line',
          'transition-[width,transform] duration-200 ease-out',
          collapsed ? 'w-16' : 'w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand */}
        <Box className={cx('h-14 flex items-center border-b border-line shrink-0', collapsed ? 'justify-center px-2' : 'px-4 gap-2.5')}>
          <Inline className="grid place-items-center size-8 rounded-control bg-brand text-white shrink-0">
            <Inline className="text-body font-semibold leading-none">L</Inline>
          </Inline>
          {!collapsed && (
            <Box className="min-w-0 flex-1">
              <Text className="text-body font-semibold text-ink leading-tight truncate">Lampose</Text>
              <Text className="text-micro uppercase text-ink-3 leading-tight">Admin Console</Text>
            </Box>
          )}
          {!collapsed && (
            <IconButton
              icon={ChevronsLeft}
              label="Collapse sidebar"
              onClick={() => setCollapsed(true)}
              className="hidden lg:grid -mr-1"
            />
          )}
        </Box>

        {/* Navigation */}
        <Nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-5">
          {visibleGroupsFor(user?.role).map((group) => (
            <Box key={group.heading}>
              {!collapsed && (
                <Text className="text-micro uppercase text-ink-3 px-2.5 mb-1.5">{group.heading}</Text>
              )}
              <List className="space-y-0.5 list-none m-0 p-0">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  const count = counts[item.id];
                  return (
                    <ListItem key={item.id}>
                      <PlainButton
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
                            <Inline className="text-body truncate flex-1 text-left">{item.label}</Inline>
                            {typeof count === 'number' && (
                              <Inline
                                className={cx(
                                  'text-label tabular shrink-0',
                                  isActive ? 'text-brand-ink' : 'text-ink-3'
                                )}
                              >
                                {count}
                              </Inline>
                            )}
                          </>
                        )}
                      </PlainButton>
                    </ListItem>
                  );
                })}
              </List>
            </Box>
          ))}
        </Nav>

        {/* Signed-in account */}
        <Box className={cx('border-t border-line shrink-0', collapsed ? 'p-2' : 'p-2.5')}>
          {collapsed ? (
            <Box className="flex flex-col items-center gap-1.5">
              <Avatar name={user?.name} src={user?.avatar} size={28} />
              <IconButton icon={LogOut} label="Sign out" onClick={logout} tone="danger" />
            </Box>
          ) : (
            <Box className="flex items-center gap-2.5 p-1.5 rounded-control">
              <Avatar name={user?.name} src={user?.avatar} size={30} />
              <Box className="min-w-0 flex-1">
                <Text className="text-sm font-medium text-ink truncate leading-tight">
                  {user?.name || 'Administrator'}
                </Text>
                <Text className="text-label text-ink-3 truncate leading-tight">{user?.role}</Text>
              </Box>
              <IconButton icon={LogOut} label="Sign out" onClick={logout} tone="danger" />
            </Box>
          )}
        </Box>
      </Aside>
    </>
  );
};
