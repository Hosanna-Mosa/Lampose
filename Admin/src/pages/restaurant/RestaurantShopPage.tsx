/* ══════════════════════════════════════════════════════════════════════════
   Shop & Settings — the restaurant record, and the parts of it an owner owns.

   Two halves, and the split is the server's, not a design choice:

     Editable   description, contact number, average prep time, minimum order,
                packaging charge, and which payment methods are taken.
     Fixed      the trading name, the address, the FSSAI and GST numbers, and
                the payout account.

   `RE_VERIFICATION_FIELDS` in `foodPartner.controller.js` refuses that second
   list from any session, and the reason is worth repeating on the screen
   rather than leaving an owner to discover it as a 403: the licence names a
   business at an address, so a name that could be edited after approval would
   silently invalidate the check somebody performed on the papers. The payout
   account is on the list for a blunter reason — a session that can repoint
   where the settlement money goes is the whole of that attack.

   So the fixed half is shown as a record with a line saying who to ask,
   rather than as inputs that will be refused. A form that offers a field the
   server will not accept is worse than one that does not offer it.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useState } from 'react';
import {
  Ban,
  Building2,
  CalendarClock,
  Clock,
  FileCheck2,
  KeyRound,
  Lock,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  Store,
} from 'lucide-react';
import { Badge } from '../../components/common/atoms/Badge';
import type { BadgeTone } from '../../components/common/atoms/Badge';
import { Box } from '../../components/common/atoms/Box';
import { Button } from '../../components/common/atoms/Button';
import { Card } from '../../components/common/atoms/Card';
import { Heading } from '../../components/common/atoms/Heading';
import { Inline } from '../../components/common/atoms/Inline';
import { Input } from '../../components/common/atoms/Input';
import { Switch } from '../../components/common/atoms/Switch';
import { Text } from '../../components/common/atoms/Text';
import { Textarea } from '../../components/common/atoms/Textarea';
import { ErrorState } from '../../components/common/molecules/ErrorState';
import { Field } from '../../components/common/molecules/Field';
import { PageHeader } from '../../components/common/molecules/PageHeader';
import { Toast } from '../../components/common/organisms/Toast';
import type { ToastState } from '../../components/common/organisms/Toast';
import { restaurantAdminService } from '../../api/services/restaurantAdminService';
import type { RestaurantRecord, ShopSettingsInput } from '../../api/services/restaurantAdminService';
import { PayoutAccounts } from '../../components/restaurant/organisms/PayoutAccounts';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../lib/useFetch';

const VERIFICATION_LOOK: Record<string, { label: string; tone: BadgeTone; icon: React.ElementType }> = {
  approved: { label: 'Approved', tone: 'good', icon: ShieldCheck },
  pending: { label: 'Awaiting approval', tone: 'warn', icon: Clock },
  rejected: { label: 'Not approved', tone: 'crit', icon: Ban },
};

interface SettingsForm {
  description: string;
  contactNumber: string;
  avgPreparationTime: string;
  acceptsCod: boolean;
  acceptsOnlinePayment: boolean;
}

const formFrom = (shop: RestaurantRecord): SettingsForm => ({
  description: shop.description ?? '',
  contactNumber: shop.contactNumber ?? '',
  avgPreparationTime: shop.avgPreparationTime != null ? String(shop.avgPreparationTime) : '',
  acceptsCod: shop.acceptsCod !== false,
  acceptsOnlinePayment: shop.acceptsOnlinePayment !== false,
});

const num = (value: string): number | undefined => {
  const text = value.trim();
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const fullAddress = (shop: RestaurantRecord): string =>
  [
    shop.address?.line1,
    shop.address?.line2,
    shop.address?.landmark,
    shop.address?.city,
    shop.address?.district,
    shop.address?.state,
    shop.address?.pincode,
  ]
    .filter(Boolean)
    .join(', ') || '—';

/** One fixed field: a label, a value, and no input. */
const Record_: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode }> = ({
  icon: Icon,
  label,
  value,
}) => (
  <Box className="flex items-start gap-3 py-2.5">
    <Inline className="grid place-items-center size-7 rounded-control bg-surface-inset text-ink-3 shrink-0 mt-0.5">
      <Icon className="size-3.5" strokeWidth={1.75} />
    </Inline>
    <Box className="min-w-0 flex-1">
      <Text className="text-label uppercase text-ink-3">{label}</Text>
      <Text className="text-sm text-ink-2 mt-0.5 break-words">{value || '—'}</Text>
    </Box>
  </Box>
);

/*
 * Changing the password — the card the approval message points at.
 *
 * An owner does not choose their first password: it is generated when Lampose
 * approves the application and sent to their mobile over WhatsApp, and that
 * message says to change it here. Until this card existed the sentence was a
 * promise the console could not keep, and the credential to a shop's orders
 * and payout accounts stayed in a chat thread on a phone that gets handed
 * around a kitchen.
 *
 * The CURRENT password is asked for as well as a session, and that is the
 * point of the card rather than an inconvenience in it: this console is left
 * signed in on a counter tablet, and without it anybody walking past could
 * lock an owner out of their own shop with two keystrokes.
 *
 * Its own component, with its own state, so a half-typed password cannot be
 * left sitting in the page's form state next to the tagline — and so the whole
 * Shop screen does not re-render on every keystroke of it.
 */
const PasswordCard: React.FC<{ onDone: (toast: ToastState) => void }> = ({ onDone }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    /* Checked here only where the answer does not depend on anything stored:
       the server owns the rest, and its sentences are the ones shown. */
    if (!current || !next) {
      setError('Enter your current password and the new one.');
      return;
    }
    if (next !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }

    setError('');
    setBusy(true);
    const res = await restaurantAdminService.changePassword(current, next);
    setBusy(false);

    if (!res.success) {
      setError(res.message || 'That could not be changed.');
      return;
    }

    setCurrent('');
    setNext('');
    setConfirm('');
    onDone({ tone: 'good', message: res.message || 'Your password has been changed.' });
  };

  return (
    <Card className="p-4 space-y-4">
      <Box className="flex items-center gap-2">
        <Heading level={2} className="text-body font-medium text-ink">
          Password
        </Heading>
        <KeyRound className="size-3.5 text-ink-3" strokeWidth={1.75} />
      </Box>
      <Text className="text-label text-ink-3">
        The password Lampose sent you when your restaurant was approved is a temporary one. Change
        it to something only you know.
      </Text>

      <Field label="Current password">
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>

      <Box className="grid sm:grid-cols-2 gap-4">
        <Field label="New password" hint="At least 6 characters.">
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
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
      </Box>

      {error ? (
        <Text className="text-label text-crit" role="alert">
          {error}
        </Text>
      ) : null}

      <Box className="flex justify-end">
        <Button onClick={submit} disabled={busy}>
          {busy ? 'Changing…' : 'Change password'}
        </Button>
      </Box>
    </Card>
  );
};

export const RestaurantShopPage: React.FC = () => {
  const { updateRestaurant } = useAuth();
  const me = useFetch(() => restaurantAdminService.profile(), []);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [flipping, setFlipping] = useState(false);

  const shop = me.data?.restaurant;

  /* The form is seeded from the record whenever a fetch delivers one — on
     first load and on every reload after a save.
     
     `me.data` is the dependency rather than `shop`, and that is not a
     formality: `useFetch` hands back a NEW object for each response, so this
     runs exactly once per response and not on every render. Seeding on each
     response also means the boxes show what was actually stored after a save,
     rather than what was typed — which is the honest thing to show when the
     server trims or clamps a value. */
  useEffect(() => {
    if (me.data?.restaurant) setForm(formFrom(me.data.restaurant));
  }, [me.data]);

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const payload: ShopSettingsInput = {
      description: form.description.trim(),
      contactNumber: form.contactNumber.trim(),
      avgPreparationTime: num(form.avgPreparationTime),
      acceptsCod: form.acceptsCod,
      acceptsOnlinePayment: form.acceptsOnlinePayment,
    };
    const res = await restaurantAdminService.updateProfile(payload);
    setSaving(false);
    if (res.success) {
      setToast({ tone: 'good', message: 'Saved.' });
      me.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Those changes could not be saved.' });
    }
  };

  const setOpenState = async (state: 'open' | 'closed' | 'auto') => {
    setFlipping(true);
    const res = await restaurantAdminService.setOpenState(state);
    setFlipping(false);
    if (res.success) {
      setToast({
        tone: 'good',
        message:
          state === 'auto'
            ? 'Back on your opening hours.'
            : state === 'open'
              ? 'Your kitchen is open.'
              : 'Your kitchen is closed.',
      });
      updateRestaurant({
        openState: state,
        ...(state === 'auto' ? {} : { isCurrentlyOpen: state === 'open' }),
      });
      me.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'That could not be changed.' });
    }
  };

  const verification = VERIFICATION_LOOK[shop?.verificationStatus ?? 'pending'] ?? VERIFICATION_LOOK.pending;
  const onSchedule = (shop?.openState ?? 'auto') === 'auto';
  const open = me.data?.isCurrentlyOpen ?? false;

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="My restaurant"
        title="Shop & settings"
        description="Your restaurant as Lampose has it, and the parts you can change yourself."
        actions={
          <Button
            size="sm"
            variant="secondary"
            icon={RefreshCw}
            onClick={me.reload}
            loading={me.refreshing}
          >
            Refresh
          </Button>
        }
      />

      {me.error && <ErrorState message={me.error} onRetry={me.reload} />}

      {shop && (
        <>
          {/* ── Trading ─────────────────────────────────────────────── */}
          <Card className="p-4">
            <Box className="flex flex-wrap items-center justify-between gap-4">
              <Box className="flex items-center gap-3">
                <Switch
                  checked={open}
                  busy={flipping}
                  onChange={(next) => setOpenState(next ? 'open' : 'closed')}
                  label={open ? 'Close the kitchen' : 'Open the kitchen'}
                />
                <Box>
                  <Text className="text-body font-medium text-ink">
                    {open ? 'Taking orders' : 'Not taking orders'}
                  </Text>
                  <Text className="text-label text-ink-3">
                    {onSchedule
                      ? 'Following your opening hours.'
                      : `Held ${open ? 'open' : 'closed'} by hand.`}
                  </Text>
                </Box>
              </Box>
              <Box className="flex items-center gap-2">
                {!onSchedule && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={CalendarClock}
                    loading={flipping}
                    onClick={() => setOpenState('auto')}
                  >
                    Back to opening hours
                  </Button>
                )}
                <Badge tone={verification.tone} icon={verification.icon}>
                  {verification.label}
                </Badge>
              </Box>
            </Box>
            {shop.verificationStatus === 'rejected' && shop.verificationNote && (
              <Box className="mt-3 pt-3 border-t border-line">
                <Text className="text-sm text-crit">{shop.verificationNote}</Text>
              </Box>
            )}
          </Card>

          <Box className="grid lg:grid-cols-2 gap-5 items-start">
            {/* ── What you can change ───────────────────────────────── */}
            <Card className="p-4 space-y-4">
              <Heading level={2} className="text-body font-medium text-ink">
                Your settings
              </Heading>

              <Field label="Tagline" hint="The single line under your name on the listing card.">
                <Textarea
                  rows={2}
                  value={form?.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Home-style Andhra meals, cooked to order."
                />
              </Field>

              <Field label="Kitchen phone number" hint="What a rider or Lampose calls.">
                <Input
                  value={form?.contactNumber ?? ''}
                  onChange={(e) => set('contactNumber', e.target.value)}
                  placeholder="0883 000 0000"
                />
              </Field>

              {/*
                Two boxes used to sit beside this one: a minimum order and a
                packaging charge. Neither is charged any more — there is no
                minimum order, and GST plus a flat platform fee replaced the
                packaging charge — and the server no longer accepts either on
                this update. A box that saves a figure nothing reads is worse
                than no box.
              */}
              <Box className="grid sm:grid-cols-3 gap-4">
                <Field label="Usual prep time (min)">
                  <Input
                    type="number"
                    min={0}
                    value={form?.avgPreparationTime ?? ''}
                    onChange={(e) => set('avgPreparationTime', e.target.value)}
                  />
                </Field>
              </Box>

              <Box className="space-y-2.5 pt-1">
                <Box className="flex items-center gap-2.5">
                  <Switch
                    checked={form?.acceptsOnlinePayment ?? true}
                    onChange={(next) => set('acceptsOnlinePayment', next)}
                    label="Accept online payment"
                  />
                  <Text className="text-sm text-ink-2">Accept online payment</Text>
                </Box>
                <Box className="flex items-center gap-2.5">
                  <Switch
                    checked={form?.acceptsCod ?? true}
                    onChange={(next) => set('acceptsCod', next)}
                    label="Accept cash on delivery"
                  />
                  <Text className="text-sm text-ink-2">Accept cash on delivery</Text>
                </Box>
              </Box>

              <Box className="pt-1">
                <Button variant="primary" icon={Save} loading={saving} onClick={save}>
                  Save changes
                </Button>
              </Box>
            </Card>

            {/* ── What only Lampose can change ──────────────────────── */}
            <Card className="p-4">
              <Box className="flex items-center gap-2 mb-1">
                <Heading level={2} className="text-body font-medium text-ink">
                  On file with Lampose
                </Heading>
                <Lock className="size-3.5 text-ink-3" strokeWidth={1.75} />
              </Box>
              <Text className="text-label text-ink-3 mb-2">
                Your licence names this business at this address, so these are changed by Lampose
                rather than from here. Contact support to correct one.
              </Text>

              <Box className="divide-y divide-line">
                <Record_ icon={Store} label="Restaurant" value={shop.restaurantName} />
                <Record_ icon={Building2} label="Owner" value={shop.ownerName} />
                <Record_
                  icon={Phone}
                  label="Registered contact"
                  value={[shop.ownerPhone, shop.ownerEmail].filter(Boolean).join(' · ')}
                />
                <Record_ icon={MapPin} label="Address" value={fullAddress(shop)} />
                <Record_ icon={FileCheck2} label="FSSAI licence" value={shop.fssaiLicenseNumber} />
                {shop.gstNumber ? (
                  <Record_ icon={FileCheck2} label="GST" value={shop.gstNumber} />
                ) : null}
                {/* The bank account used to be listed here as something only
                    Lampose could change. It is the owner's to manage now, so
                    it has moved out of this card and into `PayoutAccounts`
                    below — a field shown among things headed "changed by
                    Lampose" would be telling an owner the opposite of what
                    the button underneath does. */}
              </Box>
            </Card>

            <PasswordCard onDone={setToast} />
          </Box>

          {/* ── Where the money goes ───────────────────────────────────── */}
          <Box>
            <Heading level={2} className="text-label uppercase text-ink-3 mb-2">
              Payout
            </Heading>
            <PayoutAccounts />
          </Box>
        </>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
