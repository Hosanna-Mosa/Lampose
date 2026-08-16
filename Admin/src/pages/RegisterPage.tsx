import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthLayout } from './AuthLayout';
import { Button, Field, Input, NO_AUTOFILL, Select } from '../components/ui';
import { ADMIN_ROLES } from '../lib/domain';
import type { AdminRole } from '../api/types';

interface RegisterPageProps {
  onSwitchToLogin: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onSwitchToLogin }) => {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('Admin');
  const [secretKey, setSecretKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!secretKey.trim()) {
      setError('The admin secret key is required to create an account.');
      return;
    }

    setLoading(true);
    const res = await register(name.trim(), email.trim().toLowerCase(), password, role, secretKey.trim());
    setLoading(false);

    if (!res.success) {
      setError(res.message || 'Registration failed. Check the secret key and email address.');
    }
  };

  return (
    <AuthLayout>
      <h1 className="text-title text-ink">Create an administrator account</h1>
      <p className="text-body text-ink-2 mt-1.5">
        Registration is gated by the server-side secret key.
      </p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-4" autoComplete="off">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3 rounded-panel bg-crit-soft border border-crit-border"
          >
            <AlertCircle className="size-4 text-crit shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-sm text-ink-2">{error}</p>
          </div>
        )}

        <Field label="Full name" required>
          <Input
            required
            {...NO_AUTOFILL}
            name="lp-fullname"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Email address" required>
          <Input
            required
            type="email"
            {...NO_AUTOFILL}
            name="lp-account"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@lampose.in"
          />
        </Field>

        <Field label="Password" required hint="At least 6 characters.">
          <div className="relative">
            <Input
              required
              minLength={6}
              type={showPassword ? 'text' : 'password'}
              {...NO_AUTOFILL}
              name="lp-secret"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink transition-colors"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <Field label="Role" required>
          <Select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
            {ADMIN_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Admin secret key" required>
          <div className="relative">
            <Input
              required
              type={showSecret ? 'text' : 'password'}
              {...NO_AUTOFILL}
              name="lp-key"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              className="pr-10 font-mono"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              aria-label={showSecret ? 'Hide secret key' : 'Show secret key'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink transition-colors"
            >
              {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <p className="flex items-start gap-2 text-label text-ink-3">
          <Info className="size-3.5 shrink-0 mt-px" strokeWidth={1.75} />
          The key is verified against the backend environment. Ask an existing Super Admin if you do not
          have it.
        </p>

        <Button type="submit" variant="primary" loading={loading} className="w-full">
          Create account <ArrowRight className="size-4" strokeWidth={2} />
        </Button>
      </form>

      <p className="text-sm text-ink-3 mt-6 text-center">
        Already registered?{' '}
        <button
          onClick={onSwitchToLogin}
          className="text-brand-ink font-medium hover:underline underline-offset-2"
        >
          Sign in
        </button>
      </p>
    </AuthLayout>
  );
};
