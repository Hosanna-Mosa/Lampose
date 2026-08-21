import React, { useState } from 'react';
import { User, userApi } from '../api/userApi';
import { UserCheck, Plus, ShieldCheck, Mail, User as UserIcon, Lock, Search, Trash2, Loader2, CheckCircle2, UserPlus, Pencil, Eye, EyeOff, X } from 'lucide-react';

interface UserManagementPageProps {
  usersList: User[];
  onUserCreated: () => void;
  /**
   * The signed-in account, when the shell knows it.
   *
   * Only used to grey out the role switch on your own card. The server
   * enforces the same rule regardless — this just avoids offering an action
   * that is going to come back as an error.
   */
  currentUserId?: string;
}

export const UserManagementPage: React.FC<UserManagementPageProps> = ({ usersList, onUserCreated, currentUserId }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  /* Which account is open in the edit dialog, and the draft of its fields. */
  const [editing, setEditing] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE');
  const [editPassword, setEditPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const isSelf = Boolean(editing && currentUserId && editing.userId === currentUserId);

  const openEdit = (u: User) => {
    setEditing(u);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditRole(u.role);
    /* Always blank. There is nothing to prefill it WITH — the server stores a
       bcrypt hash and never returns it — and a masked placeholder would imply
       otherwise. Blank means "leave the password alone". */
    setEditPassword('');
    setShowPassword(false);
    setEditError('');
  };

  const closeEdit = () => {
    setEditing(null);
    setEditPassword('');
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    if (!editName.trim() || !editEmail.trim()) {
      setEditError('Name and email cannot be blank.');
      return;
    }
    if (editPassword && editPassword.length < 6) {
      setEditError('A new password must be at least 6 characters.');
      return;
    }

    /* Only what actually changed goes over the wire, so an edit to the name
       cannot quietly rewrite a role somebody changed in another tab. */
    const changes: { name?: string; email?: string; role?: 'ADMIN' | 'EMPLOYEE'; password?: string } = {};
    if (editName.trim() !== editing.name) changes.name = editName.trim();
    if (editEmail.trim() !== editing.email) changes.email = editEmail.trim();
    if (editRole !== editing.role && !isSelf) changes.role = editRole;
    if (editPassword) changes.password = editPassword;

    if (Object.keys(changes).length === 0) {
      closeEdit();
      return;
    }

    setSavingEdit(true);
    setEditError('');
    try {
      const res = await userApi.updateUser(editing.userId, changes);
      if (res.success) {
        setSuccessMsg(
          changes.password
            ? `Updated "${editName.trim()}" and set a new password. Share it with them directly and ask them to change it.`
            : `Updated the account for "${editName.trim()}".`,
        );
        setError('');
        closeEdit();
        onUserCreated();
      } else {
        setEditError(res.message || 'Failed to update the account.');
      }
    } catch (err: any) {
      setEditError(
        err.response?.data?.message || err.response?.data?.error || err.message || 'Error updating the account.',
      );
    } finally {
      setSavingEdit(false);
    }
  };

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

                <div className="flex items-center gap-1">
                {/* Edit button */}
                <button
                  type="button"
                  onClick={() => openEdit(u)}
                  className="p-2 rounded-xl text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 border border-transparent hover:border-cyan-200 transition cursor-pointer"
                  title={`Edit ${u.name}'s account`}
                >
                  <Pencil className="w-4 h-4" />
                </button>

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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Edit account modal ─────────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Edit account</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {editing.userId}</p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {editError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-2xs font-bold text-slate-500 uppercase mb-1.5">Full name</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-bold text-slate-500 uppercase mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono focus:outline-none focus:border-cyan-500 transition"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">This is what they sign in with.</p>
              </div>

              <div>
                <label className="block text-2xs font-bold text-slate-500 uppercase mb-1.5">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['EMPLOYEE', 'ADMIN'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setEditRole(r)}
                      disabled={isSelf}
                      className={`px-3 py-2.5 rounded-xl text-xs font-extrabold border transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                        editRole === r
                          ? 'bg-cyan-50 border-cyan-500 text-cyan-700'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {isSelf && (
                  <p className="text-[10px] text-amber-600 mt-1 font-semibold">
                    You cannot change your own role — sign in as another admin to do that.
                  </p>
                )}
              </div>

              {/*
                Set, never show.

                The server keeps a bcrypt hash and strips it from every
                response, so there is no existing password to display here —
                not as a policy, but because nothing in the system is holding
                one. Leaving this blank changes nothing.
              */}
              <div className="pt-1 border-t border-slate-100">
                <label className="block text-2xs font-bold text-slate-500 uppercase mb-1.5 mt-4">
                  Set a new password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Leave blank to keep the current one"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                    title={showPassword ? 'Hide' : 'Show what you are typing'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Existing passwords are stored hashed and cannot be read back — this replaces it.
                  Minimum 6 characters. Tell them to change it after signing in.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={closeEdit}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-extrabold hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-600 text-white text-xs font-extrabold hover:bg-cyan-700 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
