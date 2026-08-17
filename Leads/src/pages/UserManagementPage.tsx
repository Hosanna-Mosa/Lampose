import React, { useState } from 'react';
import { User, userApi } from '../api/userApi';
import { UserCheck, Plus, ShieldCheck, Mail, User as UserIcon, Lock, Search, Trash2, Loader2, CheckCircle2, UserPlus } from 'lucide-react';

interface UserManagementPageProps {
  usersList: User[];
  onUserCreated: () => void;
}

export const UserManagementPage: React.FC<UserManagementPageProps> = ({ usersList, onUserCreated }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Please provide both name and email.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await userApi.createUser({
        name: name.trim(),
        email: email.trim(),
        password: password.trim() || 'employee123',
        role
      });

      if (res.success) {
        setSuccessMsg(`User "${name}" created successfully with role ${role}!`);
        setName('');
        setEmail('');
        setPassword('');
        setRole('EMPLOYEE');
        onUserCreated();
      } else {
        setError('Failed to create user account.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Error creating user.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!window.confirm(`Are you sure you want to delete the account for "${userName}"? This cannot be undone.`)) {
      return;
    }

    setDeletingId(userId);
    setError('');
    setSuccessMsg('');

    try {
      const res = await userApi.deleteUser(userId);
      if (res.success) {
        setSuccessMsg(`User account "${userName}" deleted successfully.`);
        onUserCreated();
      } else {
        setError('Failed to delete user.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Error deleting user.');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredUsers = usersList.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const adminCount = usersList.filter(u => u.role === 'ADMIN').length;
  const employeeCount = usersList.filter(u => u.role === 'EMPLOYEE').length;

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4 font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-600 text-xs font-bold mb-2">
            <UserCheck className="w-3.5 h-3.5" />
            <span>Admin Console • Employee & Access Control</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Employee & User Management</h1>
          <p className="text-xs text-slate-500">
            Create new sales representatives or admin accounts, manage roles, and control system access.
          </p>
        </div>

        {/* Stats Summary Pills */}
        <div className="flex items-center gap-2">
          <div className="px-3.5 py-2 rounded-2xl bg-white border border-slate-200 shadow-sm text-center">
            <p className="text-3xs font-bold text-slate-400 uppercase">Total Accounts</p>
            <p className="text-lg font-extrabold text-slate-900">{usersList.length}</p>
          </div>
          <div className="px-3.5 py-2 rounded-2xl bg-cyan-50 border border-cyan-200 text-center">
            <p className="text-3xs font-bold text-cyan-600 uppercase">Employees</p>
            <p className="text-lg font-extrabold text-cyan-700">{employeeCount}</p>
          </div>
          <div className="px-3.5 py-2 rounded-2xl bg-amber-50 border border-amber-200 text-center">
            <p className="text-3xs font-bold text-amber-600 uppercase">Admins</p>
            <p className="text-lg font-extrabold text-amber-700">{adminCount}</p>
          </div>
        </div>
      </div>

      {/* Add New User Card */}
      <form onSubmit={handleCreateUser} className="glass-panel p-6 rounded-3xl space-y-5 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-cyan-600" />
            <span>Add New Employee / User Account</span>
          </h2>
          <span className="text-2xs font-semibold text-slate-400">Fill in account details to register user</span>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-cyan-600" />
              <span>Full Name *</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Alex Morgan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition"
              required
            />
          </div>

          {/* Email Address */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-cyan-600" />
              <span>Email Address *</span>
            </label>
            <input
              type="email"
              placeholder="e.g. alex@scriper.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition"
              required
            />
          </div>

          {/* Initial Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-cyan-600" />
              <span>Password</span>
            </label>
            <input
              type="password"
              placeholder="Default: employee123"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition font-mono"
            />
          </div>

          {/* Role Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-600" />
              <span>System Role</span>
            </label>
            <select
              value={role}
              onChange={(e: any) => setRole(e.target.value)}
              className="w-full p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition cursor-pointer font-semibold"
            >
              <option value="EMPLOYEE">👤 Employee (Sales Rep)</option>
              <option value="ADMIN">👑 Admin (Manager)</option>
            </select>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/25 transition cursor-pointer flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            <span>{loading ? 'Registering Account...' : 'Add Account to System'}</span>
          </button>
        </div>
      </form>

      {/* Users List & Search Card */}
      <div className="glass-panel p-6 rounded-3xl space-y-5 border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Registered System Accounts ({filteredUsers.length})</h2>
            <p className="text-xs text-slate-500">Overview of all active managers and sales representatives</p>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-xs font-semibold">
            No system accounts matched your search criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredUsers.map((u) => (
              <div key={u.userId} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between hover:border-cyan-200 transition">
                <div className="flex items-center gap-3.5">
                  <img
                    src={u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.name)}`}
                    alt={u.name}
                    className="w-11 h-11 rounded-2xl object-cover border border-slate-200 bg-slate-50"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-extrabold text-slate-900">{u.name}</h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        u.role === 'ADMIN' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-cyan-50 text-cyan-600 border border-cyan-200'
                      }`}>
                        {u.role}
                      </span>
                    </div>
                    <p className="text-2xs text-slate-500 font-mono mt-0.5">{u.email}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {u.userId}</p>
                  </div>
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleDeleteUser(u.userId, u.name)}
                  disabled={deletingId === u.userId}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer"
                  title={`Delete ${u.name}'s account`}
                >
                  {deletingId === u.userId ? (
                    <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
