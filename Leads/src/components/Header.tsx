import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Database, Sparkles, Activity, LogOut, UserCheck, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  onNewScrapeClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onNewScrapeClick }) => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Database className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            Scriper Data Engine
          </h1>
          <p className="text-xs text-slate-500 font-medium">Role-Based Lead Management System</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* User Session Profile & Logout */}
        {user && (
          <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-cyan-300 bg-slate-100 shrink-0 flex items-center justify-center">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <UserCheck className="w-4 h-4 text-cyan-600" />
              )}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold text-slate-900 leading-tight">{user.name}</span>
              <span className={`text-3xs font-extrabold tracking-wider uppercase ${
                isAdmin ? 'text-amber-600' : 'text-cyan-600'
              }`}>
                {user.role}
              </span>
            </div>

            <div className="h-6 w-px bg-slate-100 mx-1" />

            <button
              onClick={logout}
              className="p-1.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              title="Logout Session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* System Status */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-semibold">
          <Activity className="w-3.5 h-3.5 animate-pulse" />
          <span>System Online</span>
        </div>

        {/* Admin Scraper Launcher Button */}
        {isAdmin && (
          <button
            onClick={onNewScrapeClick}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all transform active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Launch Scraper</span>
          </button>
        )}
      </div>
    </header>
  );
};
