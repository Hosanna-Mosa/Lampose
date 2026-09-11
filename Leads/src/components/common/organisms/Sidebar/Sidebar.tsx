import React from 'react';
import { User } from '../../../../api/userApi';
import { LayoutDashboard, Search, Database, History, Users, UserCheck, Shield, CheckCircle2, Building2 } from 'lucide-react';
import { Aside, Box, Inline, Navigation, PlainButton, Text } from '../../atoms';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: User;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, currentUser }) => {
  const isAdmin = currentUser.role === 'ADMIN';

  const adminMenuItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'search', label: 'Launch Scraper', icon: Search },
    { id: 'leads', label: 'All Scraped Leads', icon: Database },
    { id: 'properties', label: 'Accommodation Properties', icon: Building2 },
    { id: 'team', label: 'Team Workload', icon: Users },
    { id: 'history', label: 'Jobs History', icon: History },
    { id: 'users', label: 'Manage Employees', icon: UserCheck },
  ] as const;

  /* Accommodation Properties is deliberately absent.
     Onboarding a property is a different job done in a different app
     (onboard.lampose.com), and putting its browser in the rep's sidebar gave
     them a tab that only ever said "No Properties Found" — this panel's
     employees convert leads, they do not manage listings. Admins keep it,
     because they are the ones checking what came out the far end. */
  const employeeMenuItems = [
    { id: 'workstation', label: 'My Assigned Leads', icon: CheckCircle2 },
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  ] as const;

  const menuItems = isAdmin ? adminMenuItems : employeeMenuItems;

  return (
    <Aside className="w-64 border-r border-slate-200 bg-white/70 backdrop-blur-xl flex flex-col justify-between p-4 min-h-[calc(100vh-4rem)]">
      <Box className="space-y-6">
        <Box className="px-3 flex items-center justify-between gap-2 text-2xs font-bold tracking-wider text-slate-400 uppercase">
          <Inline className="truncate">{isAdmin ? 'Admin Console' : 'Employee Workspace'}</Inline>
          <Inline className={`px-2 py-0.5 rounded-full text-3xs font-extrabold ${
            isAdmin ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-cyan-50 text-cyan-600 border border-cyan-200'
          }`}>
            {currentUser.role}
          </Inline>
        </Box>

        <Navigation className="space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <PlainButton
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-200 text-cyan-600 shadow-lg shadow-cyan-500/10'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-600' : 'text-slate-500'}`} />
                <Inline>{item.label}</Inline>
              </PlainButton>
            );
          })}
        </Navigation>
      </Box>

      <Box className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
        <Box className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Shield className="w-4 h-4 text-amber-600" />
          <Inline>Role Based Control</Inline>
        </Box>
        <Text className="text-2xs text-slate-500 leading-relaxed">
          {isAdmin
            ? 'Admins generate leads & assign them to sales representatives.'
            : 'Employees manage & convert their assigned business leads.'}
        </Text>
      </Box>
    </Aside>
  );
};
