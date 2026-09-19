import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Database, Lock, Mail, User as UserIcon, ShieldCheck, KeyRound, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { Box, Form, Heading, Inline, Input, Label, Option, PlainButton, Select, Text } from '../components/common/atoms';

export const LoginPage: React.FC = () => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'EMPLOYEE'>('EMPLOYEE');
  const [adminCode, setAdminCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) {
          setError('Please enter your name.');
          setLoading(false);
          return;
        }
        if (role === 'ADMIN' && !adminCode.trim()) {
          setError('Admin Security Key is required to register as an Admin.');
          setLoading(false);
          return;
        }
        const res = await register(name.trim(), email.trim(), password, role, adminCode.trim());
        if (!res.success) setError(res.error || 'Registration failed.');
      } else {
        const res = await login(email.trim(), password);
        if (!res.success) setError(res.error || 'Invalid credentials.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError('');
    setLoading(true);

    const res = await login(demoEmail, demoPass);
    if (!res.success) setError(res.error || 'Demo login failed.');
    setLoading(false);
  };

  return (
    <Box className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Glow backgrounds */}
      <Box className="absolute top-1/4 left-1/3 w-96 h-96 bg-cyan-50 rounded-full blur-3xl pointer-events-none" />
      <Box className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-blue-50 rounded-full blur-3xl pointer-events-none" />

      <Box className="w-full max-w-md space-y-6 relative z-10">
        {/* Brand Header */}
        <Box className="text-center space-y-2">
          <Box className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center mx-auto shadow-xl shadow-cyan-500/25 border border-cyan-200">
            <Database className="w-7 h-7 text-white" />
          </Box>
          <Heading level={1} className="text-2xl font-extrabold text-slate-900 tracking-tight">Scriper Data Engine</Heading>
          <Text className="text-xs text-slate-500">Role-Based Web Scraping & Lead Management Portal</Text>
        </Box>

        {/* Glass Card */}
        <Box className="glass-panel p-8 rounded-3xl border border-slate-200 shadow-2xl space-y-6">
          {/* Tab Switcher */}
          <Box className="flex p-1 rounded-xl bg-slate-100 border border-slate-200">
            <PlainButton
              onClick={() => { setIsRegister(false); setError(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                !isRegister ? 'bg-cyan-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Sign In
            </PlainButton>
            <PlainButton
              onClick={() => { setIsRegister(true); setError(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                isRegister ? 'bg-cyan-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Register Account
            </PlainButton>
          </Box>

          {error && (
            <Box className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold text-center">
              {error}
            </Box>
          )}

          {/* Form */}
          <Form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <Box className="space-y-1">
                <Label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-cyan-600" />
                  <Inline>Full Name *</Inline>
                </Label>
                <Input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition"
                  required
                />
              </Box>
            )}

            <Box className="space-y-1">
              <Label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-cyan-600" />
                <Inline>Email Address *</Inline>
              </Label>
              <Input
                type="email"
                placeholder="e.g. user@scriper.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition"
                required
              />
            </Box>

            <Box className="space-y-1">
              <Label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-cyan-600" />
                <Inline>Password *</Inline>
              </Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition font-mono"
                required
              />
            </Box>

            {isRegister && (
              <>
                <Box className="space-y-1">
                  <Label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-600" />
                    <Inline>Select Account Role</Inline>
                  </Label>
                  <Select
                    value={role}
                    onChange={(e: any) => setRole(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
                  >
                    <Option value="EMPLOYEE">👤 Employee (Sales Rep)</Option>
                    <Option value="ADMIN">👑 Admin (Manager)</Option>
                  </Select>
                </Box>

                {role === 'ADMIN' && (
                  <Box className="space-y-1 transition-all">
                    <Label className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                      <Inline>Admin Security Key *</Inline>
                    </Label>
                    <Input
                      type="password"
                      placeholder="Enter Admin Security Key"
                      value={adminCode}
                      onChange={(e) => setAdminCode(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-amber-50/50 border border-amber-300 text-xs text-slate-900 focus:outline-none focus:border-amber-500 transition font-mono"
                      required={role === 'ADMIN'}
                    />
                    <Text className="text-[10px] text-amber-600/80 font-medium">Required security passcode to authorize Admin privileges.</Text>
                  </Box>
                )}
              </>
            )}

            <PlainButton
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold text-xs shadow-xl shadow-cyan-500/25 transition cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              <Inline>{isRegister ? 'Create Account & Access' : 'Sign In to Account'}</Inline>
            </PlainButton>
          </Form>

          {/* ── Demo logins: DEVELOPMENT ONLY ───────────────────────────

              Two buttons that posted `admin@scriper.com / admin123` and
              `john@scriper.com / employee123` — a one-click ADMIN sign-in,
              shipped to the production login page with the credentials in the
              bundle for anyone to read.

              They are only inert because `SEED_DEFAULT_USERS` is off, so those
              accounts do not exist. That is a configuration flag standing
              between a stranger and an admin session, not a control: one run
              with seeding on against a real cluster arms both buttons.

              Gated on `import.meta.env.DEV`, which Vite resolves at BUILD time
              and then dead-code-eliminates — so the credentials are not merely
              hidden in production, they are absent from the bundle. */}
          {import.meta.env.DEV && (
          <Box className="pt-4 border-t border-slate-200 space-y-2 text-center">
              <Inline className="text-3xs font-bold tracking-wider text-slate-400 uppercase">Quick Demo Login Presets</Inline>
              <Box className="grid grid-cols-2 gap-2">
                <PlainButton
                  type="button"
                  onClick={() => handleDemoLogin('admin@scriper.com', 'admin123')}
                  className="p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 text-2xs font-bold transition cursor-pointer"
                >
                  👑 Demo Admin
                </PlainButton>
                <PlainButton
                  type="button"
                  onClick={() => handleDemoLogin('john@scriper.com', 'employee123')}
                  className="p-2.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-600 border border-cyan-200 text-2xs font-bold transition cursor-pointer"
                >
                  👤 Demo Employee John
                </PlainButton>
              </Box>
          </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
