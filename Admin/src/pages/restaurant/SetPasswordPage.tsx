/* ══════════════════════════════════════════════════════════════════════════
   "Create your password" — where the approval WhatsApp lands.

   An owner whose restaurant has just been approved has never signed in and has
   no password: the account carries a random hash written at onboarding that
   nobody has ever seen. The message they get carries a LINK rather than a
   credential — Meta twice refused to register a WhatsApp template containing
   one, and a link that expires and dies on first use is the better answer
   anyway — and this is the page at the end of it.

   ## No session, and none is read

   Rendered OUTSIDE the sign-in provider (see `App`), exactly like
   `OrderLinkPage`: the token is the whole of the proof, nothing here reads or
   writes a stored session, and a wrong link cannot sign somebody out of the
   console they have open in another tab.

   ## The link is checked BEFORE the form is drawn

   An owner who types a password, presses save and is then told the link
   expired two hours ago has been made to do work for nothing. So the page asks
   first, and an unusable link is a sentence and a way forward rather than a
   form that will refuse.

   ## The path says "account-setup", the page says password

   Deliberately. The console path is what appears inside the WhatsApp message,
   and Meta refused three templates with the word "password" anywhere in them —
   including once inside the sample URL. The page an owner actually lands on is
   free to call the thing by its name.

   ## Built for a phone

   One column, one card. It is opened from WhatsApp, on a handset, usually
   standing in a shop.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { Box } from '../../components/common/atoms/Box';
import { Button } from '../../components/common/atoms/Button';
import { Card } from '../../components/common/atoms/Card';
import { Heading } from '../../components/common/atoms/Heading';
import { Inline } from '../../components/common/atoms/Inline';
import { Input } from '../../components/common/atoms/Input';
import { Main } from '../../components/common/atoms/Main';
import { Text } from '../../components/common/atoms/Text';
import { Field } from '../../components/common/molecules/Field';
import { restaurantAdminService } from '../../api/services/restaurantAdminService';

interface SetPasswordPageProps {
  /** The 64-character token out of the link. */
  token: string;
}

/** Matches the server's own floor — `MIN_PASSWORD` in restaurantAdmin.controller.js. */
const MIN_PASSWORD = 6;

type Phase = 'checking' | 'ready' | 'unusable' | 'done';

interface Owner {
  restaurantName: string;
  ownerName: string;
  userId: string;
}

export const SetPasswordPage: React.FC<SetPasswordPageProps> = ({ token }) => {
  const [phase, setPhase] = useState<Phase>('checking');
  const [owner, setOwner] = useState<Owner | null>(null);
  const [problem, setProblem] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;

    restaurantAdminService.checkSetupLink(token).then((res) => {
      if (!live) return;
      if (res.success && res.data) {
        setOwner(res.data);
        setPhase('ready');
        return;
      }
      /* The server's own sentence: "that link has already been used", "that
         link has expired". Each says what to do next, which a code does not. */
      setProblem(res.message || 'That link is not valid. Ask Lampose to send you a new one.');
      setPhase('unusable');
    });

    return () => { live = false; };
  }, [token]);

  const submit = async () => {
    if (password.length < MIN_PASSWORD) {
      setError(`Use a password of at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setError('');
    setBusy(true);
    const res = await restaurantAdminService.setPasswordFromLink(token, password);
    setBusy(false);

    if (res.success) {
      setPhase('done');
      return;
    }

    /* A link that died between the page opening and this press — see the
       server, which checks it again for exactly that reason. */
    if (res.status === 410) {
      setProblem(res.message || 'That link is no longer usable.');
      setPhase('unusable');
      return;
    }
    setError(res.message || 'That could not be saved. Try again.');
  };

  /* Same origin, so the console is simply the root of where this page is
     served from — no host to configure and nothing to get wrong. */
  const toSignIn = () => { window.location.assign('/'); };

  return (
    <Box className="min-h-screen bg-canvas">
      <Box role="banner" className="bg-surface border-b border-line">
        <Box className="mx-auto max-w-lg px-4 h-14 flex items-center gap-2.5">
          <Inline className="grid place-items-center size-8 rounded-control bg-brand text-white shrink-0">
            <Inline className="text-body font-semibold leading-none">L</Inline>
          </Inline>
          <Box className="min-w-0">
            <Text className="text-body font-semibold text-ink leading-tight truncate">
              {owner?.restaurantName || 'Lampose'}
            </Text>
            <Text className="text-micro uppercase text-ink-3 leading-tight">Partner console</Text>
          </Box>
        </Box>
      </Box>

      <Main className="mx-auto max-w-lg px-4 py-5 space-y-4">
        {phase === 'checking' && (
          <Card className="p-5">
            <Text className="text-body text-ink-2" role="status">Checking your link…</Text>
          </Card>
        )}

        {phase === 'unusable' && (
          <Card className="p-5 space-y-3">
            <Heading level={1} className="text-title text-ink">This link cannot be used</Heading>
            <Text className="text-body text-ink-2">{problem}</Text>
            <Text className="text-label text-ink-3">
              Lampose can send you a new one. If you have already set a password, sign in with it
              instead.
            </Text>
            <Button variant="ghost" onClick={toSignIn}>Go to sign in</Button>
          </Card>
        )}

        {phase === 'ready' && owner && (
          <Card className="p-5 space-y-4">
            <Box className="flex items-center gap-2">
              <KeyRound className="size-4 text-ink-3" strokeWidth={1.75} />
              <Heading level={1} className="text-title text-ink">Create your password</Heading>
            </Box>

            <Text className="text-body text-ink-2">
              {owner.restaurantName} has been approved. Choose a password, and sign in with your
              mobile number <Inline className="font-semibold text-ink">{owner.userId}</Inline>.
            </Text>

            <Field label="New password" hint={`At least ${MIN_PASSWORD} characters.`}>
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            <Field label="New password again">
              <Input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>

            {error ? (
              <Text className="text-label text-crit" role="alert">{error}</Text>
            ) : null}

            <Button onClick={submit} disabled={busy} className="w-full">
              {busy ? 'Saving…' : 'Save password'}
            </Button>

            <Text className="text-label text-ink-3">
              This link works once. You can change your password later from Shop &amp; Settings.
            </Text>
          </Card>
        )}

        {phase === 'done' && owner && (
          <Card className="p-5 space-y-3">
            <Box className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-good" strokeWidth={1.75} />
              <Heading level={1} className="text-title text-ink">Your password is set</Heading>
            </Box>
            <Text className="text-body text-ink-2">
              Sign in with your mobile number{' '}
              <Inline className="font-semibold text-ink">{owner.userId}</Inline> and the password you
              just chose.
            </Text>
            <Button onClick={toSignIn} className="w-full">Go to sign in</Button>
          </Card>
        )}
      </Main>
    </Box>
  );
};
