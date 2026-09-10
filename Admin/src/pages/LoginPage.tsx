import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/atoms/Button';
import { Input } from '../components/common/atoms/Input';
import { Field } from '../components/common/molecules/Field';
import { AuthLayout } from '../components/common/templates/AuthLayout';
import { NO_AUTOFILL } from '../components/common/utils';
import { Box } from '../components/common/atoms/Box';
import { Form } from '../components/common/atoms/Form';
import { Heading } from '../components/common/atoms/Heading';
import { PlainButton } from '../components/common/atoms/PlainButton';
import { Text } from '../components/common/atoms/Text';

interface LoginPageProps {
  onSwitchToRegister: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSwitchToRegister }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await login(email.trim().toLowerCase(), password);
    setLoading(false);

    if (!res.success) {
      setError(res.message || 'Sign-in failed. Check your email and password.');
    }
  };

  return (
    <AuthLayout>
      <Heading level={1} className="text-title text-ink">Sign in</Heading>
      <Text className="text-body text-ink-2 mt-1.5">
        Use your Lampose administrator credentials.
      </Text>

      <Form onSubmit={handleSubmit} className="mt-7 space-y-4" autoComplete="off">
        {error && (
          <Box
            role="alert"
            className="flex items-start gap-2.5 p-3 rounded-panel bg-crit-soft border border-crit-border"
          >
            <AlertCircle className="size-4 text-crit shrink-0 mt-0.5" strokeWidth={2} />
            <Text className="text-sm text-ink-2">{error}</Text>
          </Box>
        )}

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

        <Field label="Password" required>
          <Box className="relative">
            <Input
              required
              type={showPassword ? 'text' : 'password'}
              {...NO_AUTOFILL}
              name="lp-secret"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pr-10"
            />
            <PlainButton
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink transition-colors"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </PlainButton>
          </Box>
        </Field>

        <Button type="submit" variant="primary" loading={loading} className="w-full">
          Sign in <ArrowRight className="size-4" strokeWidth={2} />
        </Button>
      </Form>

      <Text className="text-sm text-ink-3 mt-6 text-center">
        Need an account?{' '}
        <PlainButton
          onClick={onSwitchToRegister}
          className="text-brand-ink font-medium hover:underline underline-offset-2"
        >
          Register with the admin secret key
        </PlainButton>
      </Text>
    </AuthLayout>
  );
};
