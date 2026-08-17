import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './pages/LoginPage';
import { DashboardOverview } from './pages/DashboardOverview';
import { ScraperSearchPage } from './pages/ScraperSearchPage';
import { ScrapedLeadsDashboard } from './pages/ScrapedLeadsDashboard';
import { AccommodationPropertiesPage } from './pages/AccommodationPropertiesPage';
import { ScrapeHistoryPage } from './pages/ScrapeHistoryPage';
import { EmployeeWorkstation } from './pages/EmployeeWorkstation';
import { AdminTeamOverview } from './pages/AdminTeamOverview';
import { UserManagementPage } from './pages/UserManagementPage';
import { LiveProgressModal } from './components/LiveProgressModal';
import { NewlyExtractedModal } from './components/NewlyExtractedModal';
import { userApi, User } from './api/userApi';
import { Loader2 } from 'lucide-react';

function MainAppContent() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [usersList, setUsersList] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [newlyExtractedJobId, setNewlyExtractedJobId] = useState<string | null>(null);
  const [selectedDashboardJobId, setSelectedDashboardJobId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await userApi.getUsers();
      if (res.success && res.data) {
        setUsersList(res.data);
      }
    } catch (e) {
      console.error('Error fetching users list:', e);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchUsers();
      if (user?.role === 'EMPLOYEE') {
        setActiveTab('workstation');
      } else {
        setActiveTab('overview');
      }
    }
  }, [isAuthenticated, user?.role]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-900">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 text-cyan-600 animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-semibold">Validating session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <LoginPage />;
  }

  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Header */}
      <Header onNewScrapeClick={() => setActiveTab('search')} />

      <div className="flex flex-1">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            if (tab === 'leads') setSelectedDashboardJobId('ALL');
            setActiveTab(tab);
          }}
          currentUser={user}
        />

        {/* Main Content Workspace */}
        <main className="flex-1 p-8 overflow-y-auto">
          {activeTab === 'overview' && (
            <DashboardOverview
              onNavigateToSearch={() => setActiveTab(isAdmin ? 'search' : 'workstation')}
              onNavigateToLeads={() => {
                setSelectedDashboardJobId('ALL');
                setActiveTab(isAdmin ? 'leads' : 'workstation');
              }}
            />
          )}

          {activeTab === 'workstation' && (
            <EmployeeWorkstation currentUser={user} />
          )}

          {activeTab === 'properties' && (
            <AccommodationPropertiesPage />
          )}

          {activeTab === 'search' && isAdmin && (
            <ScraperSearchPage onJobStarted={(jobId) => setActiveJobId(jobId)} />
          )}

          {activeTab === 'leads' && (
            <ScrapedLeadsDashboard currentUser={user} usersList={usersList} initialJobId={selectedDashboardJobId} />
          )}

          {activeTab === 'team' && isAdmin && (
            <AdminTeamOverview onNavigateToLeads={() => {
              setSelectedDashboardJobId('ALL');
              setActiveTab('leads');
            }} />
          )}

          {activeTab === 'history' && isAdmin && (
            <ScrapeHistoryPage onReRunJob={() => setActiveTab('search')} />
          )}

          {activeTab === 'users' && isAdmin && (
            <UserManagementPage usersList={usersList} onUserCreated={fetchUsers} />
          )}
        </main>
      </div>

      {/* Live Scrape Progress Modal */}
      {activeJobId && (
        <LiveProgressModal
          jobId={activeJobId}
          onClose={() => setActiveJobId(null)}
          onViewResults={() => {
            const finishedJobId = activeJobId;
            setActiveJobId(null);
            setNewlyExtractedJobId(finishedJobId);
          }}
        />
      )}

      {/* Fresh Scrape Results Dialogue Modal */}
      {newlyExtractedJobId && (
        <NewlyExtractedModal
          jobId={newlyExtractedJobId}
          currentUser={user}
          usersList={usersList}
          onClose={() => setNewlyExtractedJobId(null)}
          onGoToAllLeads={(jobId) => {
            setNewlyExtractedJobId(null);
            if (jobId) setSelectedDashboardJobId(jobId);
            setActiveTab('leads');
          }}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}

export default App;
