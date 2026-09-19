/* ══════════════════════════════════════════════════════════════════════════
   Sign in — two doors, one screen.

     Super Admin       Lampose staff, an `admins` account. Email and password.
     Restaurant Admin  a restaurant OWNER, a `food_restaurants` account. The
                       same email-or-phone and password they use in the
                       Food-Partner app.

   The two go to different endpoints and come back with different tokens —
   see AuthContext. The picker is here rather than at two URLs because a
   person arriving at this console knows who they are and does not know which
   address to type, and because a wrong guess costs one click rather than a
   support message.

   ## Why the picker changes the field, not just the endpoint

   An owner may have signed up with a phone number and no email at all, and
   `type="email"` on that box would have the browser refuse a valid login
   before it was ever sent. So the identifier field changes shape with the
   role: an email box for staff, a plain text box for an owner, whose server
   decides which kind of value it got from the `@`.

   The registration link belongs to the staff door only. It creates the
   FIRST administrator against a secret key and is refused once one exists;
   a restaurant does not register here at all — an application comes through
   the Food-Partner app or an onboarding agent, and is approved by staff.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, ShieldCheck, UtensilsCrossed } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { SessionKind } from '../context/AuthContext';
import { Button } from '../components/common/atoms/Button';
import { Input } from '../components/common/atoms/Input';
import { Field } from '../components/common/molecules/Field';
import { AuthLayout } from '../components/common/templates/AuthLayout';
import { NO_AUTOFILL, cx } from '../components/common/utils';
import { Box } from '../components/common/atoms/Box';
import { Form } from '../components/common/atoms/Form';
import { Heading } from '../components/common/atoms/Heading';
import { Inline } from '../components/common/atoms/Inline';
import { PlainButton } from '../components/common/atoms/PlainButton';
import { Text } from '../components/common/atoms/Text';

interface LoginPageProps {
  onSwitchToRegister: () => void;
}

/** Everything that differs between the two doors, in one table. */
const DOORS: Record<
  SessionKind,
  {
    label: string;
    icon: React.ElementType;
    blurb: string;
    fieldLabel: string;
    placeholder: string;
    /** 'email' makes the browser validate; owners may sign in with a number. */
    inputType: 'email' | 'text';
  }
> = {
  admin: {
    label: 'Super Admin',
    icon: ShieldCheck,
    blurb: 'Use your Lampose administrator credentials.',
    fieldLabel: 'Email address',
    placeholder: 'name@lampose.in',
    inputType: 'email',
  },
  restaurant: {
    label: 'Restaurant Admin',
    icon: UtensilsCrossed,
    blurb: 'Sign in with the email or phone number your restaurant is registered with.',
    fieldLabel: 'Email or phone number',
    placeholder: 'kitchen@example.com or 98765 43210',
    inputType: 'text',
  },
};

const ORDER: SessionKind[] = ['admin', 'restaurant'];

export const LoginPage: React.FC<LoginPageProps> = ({ onSwitchToRegister }) => {
  const { login, loginAsRestaurant } = useAuth();
  const [role, setRole] = useState<SessionKind>('admin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const door = DOORS[role];

  /* Switching doors clears the refusal from the other one. Leaving "invalid
     administrator credentials" on screen while somebody types a restaurant's
     phone number reads as though the new attempt has already failed. The
     typed values stay: an owner whose account is also a staff account should
     not have to type it twice. */
  const chooseRole = (next: SessionKind) => {
    if (next === role) return;
    setRole(next);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const value = identifier.trim();
    const res =
      role === 'admin'
        ? await login(value.toLowerCase(), password)
        : /* NOT lower-cased: the server lower-cases an email itself and a
             phone number is normalised by its digits, so folding the case
             here would only mangle the one shape neither step expects. */
          await loginAsRestaurant(value, password);

    setLoading(false);

    if (!res.success) {
      setError(res.message || 'Sign-in failed. Check your details and try again.');
    }
  };

  return (
    <AuthLayout>
      <Heading level={1} className="text-title text-ink">Sign in</Heading>
      <Text className="text-body text-ink-2 mt-1.5">{door.blurb}</Text>

      {/* The picker. A radio group rather than a dropdown: there are two
          choices, they are the first decision on the screen, and both should
          be readable without opening anything. */}
      <Box
        role="radiogroup"
        aria-label="Sign in as"
        className="mt-6 grid grid-cols-2 gap-2"
      >
        {ORDER.map((id) => {
          const option = DOORS[id];
          const Icon = option.icon;
          const active = role === id;
          return (
            <PlainButton
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => chooseRole(id)}
              className={cx(
                'flex items-center gap-2 px-3 h-11 rounded-control border transition-colors duration-120 text-left',
                active
                  ? 'bg-brand-soft border-brand-border text-brand-ink font-medium'
                  : 'bg-surface border-line text-ink-2 hover:bg-surface-inset hover:text-ink'
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={active ? 2 : 1.75} />
              <Inline className="text-sm truncate">{option.label}</Inline>
            </PlainButton>
          );
        })}
      </Box>

      <Form onSubmit={handleSubmit} className="mt-5 space-y-4" autoComplete="off">
        {error && (
          <Box
            role="alert"
            className="flex items-start gap-2.5 p-3 rounded-panel bg-crit-soft border border-crit-border"
          >
            <AlertCircle className="size-4 text-crit shrink-0 mt-0.5" strokeWidth={2} />
            <Text className="text-sm text-ink-2">{error}</Text>
          </Box>
        )}

        <Field label={door.fieldLabel} required>
          <Input
            required
            /* Keyed by role so React swaps the input rather than reusing it.
               Without this the browser keeps the old element's validity state,
               and a value typed as an email stays marked invalid in the text
               box it becomes. */
            key={role}
            type={door.inputType}
            {...NO_AUTOFILL}
            name="lp-account"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={door.placeholder}
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
          Sign in as {door.label} <ArrowRight className="size-4" strokeWidth={2} />
        </Button>
      </Form>

      {role === 'admin' ? (
        <Text className="text-sm text-ink-3 mt-6 text-center">
          Need an account?{' '}
          <PlainButton
            onClick={onSwitchToRegister}
            className="text-brand-ink font-medium hover:underline underline-offset-2"
          >
            Register with the admin secret key
          </PlainButton>
        </Text>
      ) : (
        <Text className="text-sm text-ink-3 mt-6 text-center">
          New restaurant? Apply through the Lampose Food Partner app — your login
          works here as soon as the application is submitted.
        </Text>
      )}
    </AuthLayout>
  );
};
