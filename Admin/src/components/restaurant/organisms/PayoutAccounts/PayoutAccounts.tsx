/* ══════════════════════════════════════════════════════════════════════════
   Payout accounts — the card, and the drawer behind it.

   Used on both Earnings and Shop & Settings, because it answers a question
   asked from both: "where is my money going?" One component rather than two
   copies, since the second copy is the one that would quietly stop matching.

   ## The card answers the question without being opened

   An owner checking their bank does not want to click anything — they want
   the last four digits and the IFSC, and to see they match. So the summary
   card carries the active account in full (as full as we hold it), and the
   button is for CHANGING something, which is the rarer act.

   ## Switching asks twice

   Not a security gate — the server does not require one, by decision. It
   asks because "make active" beside a list of similar-looking rows is a
   click that sends next week's money somewhere else, and the row you meant
   and the row above it differ by four digits. The confirm names the account
   in words, so the thing being agreed to is legible.

   ## The number is typed twice and never read back

   The server compares them and refuses a mismatch, because a mistyped
   account number is not caught by anything downstream — it is money sent to
   a stranger, or to nobody, and found out a week later. After it is saved,
   nothing can show it again: it is `select: false` on the model and deleted
   from every response. That is why the list shows `•••• 1190` rather than a
   masked field somebody might expect to reveal.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import {
  AlertCircle,
  Banknote,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CreditCard,
  Info,
  Plus,
  Smartphone,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Badge } from '../../../common/atoms/Badge';
import { Box } from '../../../common/atoms/Box';
import { Button } from '../../../common/atoms/Button';
import { Card } from '../../../common/atoms/Card';
import { Inline } from '../../../common/atoms/Inline';
import { Input } from '../../../common/atoms/Input';
import { Option } from '../../../common/atoms/Option';
import { Select } from '../../../common/atoms/Select';
import { Strong } from '../../../common/atoms/Strong';
import { Switch } from '../../../common/atoms/Switch';
import { Text } from '../../../common/atoms/Text';
import { EmptyState } from '../../../common/molecules/EmptyState';
import { ErrorState } from '../../../common/molecules/ErrorState';
import { Field } from '../../../common/molecules/Field';
import { Modal } from '../../../common/organisms/Modal';
import { Toast } from '../../../common/organisms/Toast';
import type { ToastState } from '../../../common/organisms/Toast';
import { cx } from '../../../common/utils';
import { restaurantAdminService } from '../../../../api/services/restaurantAdminService';
import type {
  PayoutAccount,
  PayoutAccountInput,
} from '../../../../api/services/restaurantAdminService';
import { useFetch } from '../../../../lib/useFetch';
import { formatDate } from '../../../../lib/format';

interface AddForm {
  accountHolderName: string;
  bankAccountNumber: string;
  confirmAccountNumber: string;
  ifscCode: string;
  accountType: 'savings' | 'current';
  label: string;
  upiId: string;
  makeActive: boolean;
}

const EMPTY_FORM: AddForm = {
  accountHolderName: '',
  bankAccountNumber: '',
  confirmAccountNumber: '',
  ifscCode: '',
  accountType: 'current',
  label: '',
  upiId: '',
  makeActive: false,
};

/** `•••• 1190`, or a plain dash when we never had an account at all. */
const masked = (last4: string): string => (last4 ? `•••• ${last4}` : '—');

/** One saved account in the list. */
const AccountRow: React.FC<{
  account: PayoutAccount;
  busy: boolean;
  onActivate: () => void;
  onRemove: () => void;
}> = ({ account, busy, onActivate, onRemove }) => (
  <Box
    className={cx(
      'flex flex-wrap items-start gap-3 p-3 rounded-panel border',
      account.isActive ? 'border-good-border bg-good-soft' : 'border-line bg-surface'
    )}
  >
    <Inline
      className={cx(
        'grid place-items-center size-8 rounded-control shrink-0',
        account.isActive ? 'bg-good text-white' : 'bg-surface-inset text-ink-3'
      )}
    >
      {account.isActive ? (
        <BadgeCheck className="size-4" strokeWidth={2} />
      ) : (
        <Building2 className="size-4" strokeWidth={1.75} />
      )}
    </Inline>

    <Box className="min-w-0 flex-1">
      <Box className="flex flex-wrap items-center gap-2">
        <Strong className="text-sm text-ink tabular">{masked(account.accountLast4)}</Strong>
        {account.isActive && (
          <Badge tone="good" icon={CheckCircle2}>
            Money goes here
          </Badge>
        )}
        {account.label && <Badge tone="neutral">{account.label}</Badge>}
      </Box>
      <Text className="text-label text-ink-2 mt-1">
        {account.accountHolderName}
        {account.ifscCode ? ` · ${account.ifscCode}` : ''}
        {account.accountType ? ` · ${account.accountType}` : ''}
      </Text>
      {account.upiId && (
        <Text className="text-label text-ink-3 mt-0.5 inline-flex items-center gap-1">
          <Smartphone className="size-3" strokeWidth={1.75} /> {account.upiId}
        </Text>
      )}
      {account.addedAt && (
        <Text className="text-label text-ink-3 mt-0.5">Added {formatDate(account.addedAt)}</Text>
      )}
    </Box>

    <Box className="flex items-center gap-1.5 shrink-0">
      {!account.isActive && (
        <Button size="sm" variant="secondary" loading={busy} onClick={onActivate}>
          Send money here
        </Button>
      )}
      {/* The active account offers no Remove. The server refuses it too
          (409 ACCOUNT_IS_ACTIVE) while another account could take over —
          removing it would leave the platform paying into an account the
          owner has just disowned. */}
      {!account.isActive && (
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          loading={busy}
          onClick={onRemove}
          aria-label={`Remove the account ending ${account.accountLast4}`}
        >
          Remove
        </Button>
      )}
    </Box>
  </Box>
);

export const PayoutAccounts: React.FC = () => {
  const list = useFetch(() => restaurantAdminService.payoutAccounts(), []);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  /* The two confirmations, held as the account they are about. */
  const [switching, setSwitching] = useState<PayoutAccount | null>(null);
  const [removing, setRemoving] = useState<PayoutAccount | null>(null);

  const accounts = list.data?.accounts ?? [];
  const maxAccounts = list.data?.maxAccounts ?? 8;
  const active = accounts.find((a) => a.isActive) ?? null;
  const full = accounts.length >= maxAccounts;

  const set = <K extends keyof AddForm>(key: K, value: AddForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, makeActive: accounts.length === 0 });
    setFormError(null);
    setAdding(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    const payload: PayoutAccountInput = {
      accountHolderName: form.accountHolderName,
      bankAccountNumber: form.bankAccountNumber,
      confirmAccountNumber: form.confirmAccountNumber,
      ifscCode: form.ifscCode.toUpperCase(),
      accountType: form.accountType,
      label: form.label,
      upiId: form.upiId,
      makeActive: form.makeActive,
    };
    const res = await restaurantAdminService.addPayoutAccount(payload);
    setSaving(false);

    if (res.success) {
      setToast({
        tone: 'good',
        message: form.makeActive
          ? `Saved. Your money now goes to the account ending ${res.data?.accountLast4 ?? ''}.`
          : 'Account saved.',
      });
      setAdding(false);
      list.reload();
      return;
    }
    /* Kept in the form rather than thrown as a toast: the modal stays open,
       what was typed stays in it, and the reason sits above the fields. */
    setFormError(res.message || 'That account could not be saved.');
  };

  const confirmSwitch = async () => {
    if (!switching) return;
    setBusyId(switching.accountId);
    const res = await restaurantAdminService.activatePayoutAccount(switching.accountId);
    setBusyId(null);
    if (res.success) {
      setToast({
        tone: 'good',
        message: `Your money now goes to the account ending ${switching.accountLast4}.`,
      });
      setSwitching(null);
      list.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'That could not be changed.' });
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setBusyId(removing.accountId);
    const res = await restaurantAdminService.removePayoutAccount(removing.accountId);
    setBusyId(null);
    if (res.success) {
      setToast({ tone: 'good', message: `Account ending ${removing.accountLast4} removed.` });
      setRemoving(null);
      list.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'That account could not be removed.' });
    }
  };

  return (
    <>
      {/* ── The card ───────────────────────────────────────────────────── */}
      <Card className="p-4">
        <Box className="flex flex-wrap items-start justify-between gap-4">
          <Box className="flex items-start gap-3 min-w-0">
            <Inline className="grid place-items-center size-9 rounded-control bg-surface-inset text-ink-3 shrink-0">
              <Banknote className="size-4" strokeWidth={1.75} />
            </Inline>
            <Box className="min-w-0">
              <Text className="text-label uppercase text-ink-3">Payout account</Text>
              {list.loading ? (
                <Text className="text-body text-ink-3 mt-1">Loading…</Text>
              ) : active ? (
                <>
                  <Text className="text-body font-medium text-ink mt-0.5 tabular">
                    {masked(active.accountLast4)}
                    {active.label ? ` · ${active.label}` : ''}
                  </Text>
                  <Text className="text-label text-ink-2 mt-0.5">
                    {active.accountHolderName}
                    {active.ifscCode ? ` · ${active.ifscCode}` : ''}
                  </Text>
                </>
              ) : (
                <>
                  <Text className="text-body font-medium text-warn mt-0.5">
                    No account on file
                  </Text>
                  <Text className="text-label text-ink-2 mt-0.5">
                    Lampose has nowhere to send your money. Add an account to be paid.
                  </Text>
                </>
              )}
            </Box>
          </Box>

          <Box className="flex items-center gap-2 shrink-0">
            {accounts.length > 1 && (
              <Text className="text-label text-ink-3 hidden sm:block">
                {accounts.length} saved
              </Text>
            )}
            <Button
              variant={active ? 'secondary' : 'primary'}
              icon={active ? Wallet : Plus}
              onClick={() => setOpen(true)}
            >
              {active ? 'Manage payout' : 'Add a bank account'}
            </Button>
          </Box>
        </Box>

        {list.error && (
          <Box className="mt-3">
            <ErrorState message={list.error} onRetry={list.reload} />
          </Box>
        )}
      </Card>

      {/* ── The drawer ─────────────────────────────────────────────────── */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Payout accounts"
        description="Where Lampose sends your settlements. One account is active at a time."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              icon={Plus}
              onClick={openAdd}
              disabled={full}
              title={full ? `You can keep ${maxAccounts} accounts.` : undefined}
            >
              Add an account
            </Button>
          </>
        }
      >
        <Box className="space-y-3">
          {accounts.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="No bank account saved"
              description="Add the account your settlements should be paid into. You can save more than one and switch between them."
              action={
                <Button variant="primary" icon={Plus} onClick={openAdd}>
                  Add a bank account
                </Button>
              }
            />
          ) : (
            accounts.map((account) => (
              <AccountRow
                key={account.accountId}
                account={account}
                busy={busyId === account.accountId}
                onActivate={() => setSwitching(account)}
                onRemove={() => setRemoving(account)}
              />
            ))
          )}

          {full && (
            <Box className="flex items-start gap-2 text-label text-ink-3">
              <Info className="size-3.5 shrink-0 mt-0.5" strokeWidth={2} />
              You have saved the maximum of {maxAccounts} accounts. Remove one you no longer use to
              add another.
            </Box>
          )}
        </Box>
      </Modal>

      {/* ── Add ────────────────────────────────────────────────────────── */}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a bank account"
        description="Check the number against a statement or passbook. Once saved it cannot be shown again."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={save}>
              Save account
            </Button>
          </>
        }
      >
        <Box className="space-y-4">
          {formError && (
            <Box
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-panel bg-crit-soft border border-crit-border"
            >
              <AlertCircle className="size-4 text-crit shrink-0 mt-0.5" strokeWidth={2} />
              <Text className="text-sm text-ink-2">{formError}</Text>
            </Box>
          )}

          <Field
            label="Account holder's name"
            required
            hint="Exactly as the bank has it, or the transfer is rejected."
          >
            <Input
              value={form.accountHolderName}
              onChange={(e) => set('accountHolderName', e.target.value)}
              placeholder="As printed on the passbook"
            />
          </Field>

          <Box className="grid sm:grid-cols-2 gap-4">
            <Field label="Bank account number" required>
              <Input
                value={form.bankAccountNumber}
                onChange={(e) => set('bankAccountNumber', e.target.value)}
                placeholder="9 to 18 digits"
                inputMode="numeric"
                autoComplete="off"
              />
            </Field>
            <Field label="Confirm account number" required hint="Typed twice on purpose.">
              <Input
                value={form.confirmAccountNumber}
                onChange={(e) => set('confirmAccountNumber', e.target.value)}
                placeholder="Type it again"
                inputMode="numeric"
                autoComplete="off"
                /* Pasting the first box into the second defeats the check
                   entirely, which is the one thing this field is for. */
                onPaste={(e) => e.preventDefault()}
              />
            </Field>
          </Box>

          <Box className="grid sm:grid-cols-2 gap-4">
            <Field label="IFSC" required hint="11 characters, like HDFC0001234.">
              <Input
                value={form.ifscCode}
                onChange={(e) => set('ifscCode', e.target.value.toUpperCase())}
                placeholder="HDFC0001234"
                autoComplete="off"
              />
            </Field>
            <Field label="Account type">
              <Select
                value={form.accountType}
                onChange={(e) => set('accountType', e.target.value as 'savings' | 'current')}
              >
                <Option value="current">Current</Option>
                <Option value="savings">Savings</Option>
              </Select>
            </Field>
          </Box>

          <Box className="grid sm:grid-cols-2 gap-4">
            <Field label="Nickname" hint="Only for you — “HDFC current”.">
              <Input
                value={form.label}
                onChange={(e) => set('label', e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="UPI ID" hint="Optional. Used for small or urgent transfers.">
              <Input
                value={form.upiId}
                onChange={(e) => set('upiId', e.target.value)}
                placeholder="name@bank"
                autoComplete="off"
              />
            </Field>
          </Box>

          {/* The first account is active whatever this says — the server
              decides that, because a shop with one account and none active
              could not be paid. So the switch is only offered once there is
              something to switch away from. */}
          {accounts.length > 0 && (
            <Box className="flex items-center gap-2.5 pt-1">
              <Switch
                checked={form.makeActive}
                onChange={(next) => set('makeActive', next)}
                label="Send my money to this account"
              />
              <Text className="text-sm text-ink-2">
                {form.makeActive
                  ? 'Settlements will go to this account from now on.'
                  : 'Just save it — keep paying into the current account.'}
              </Text>
            </Box>
          )}
        </Box>
      </Modal>

      {/* ── Confirm a switch ───────────────────────────────────────────── */}
      <Modal
        open={Boolean(switching)}
        onClose={() => setSwitching(null)}
        title="Change where your money goes?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSwitching(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={CreditCard}
              loading={busyId === switching?.accountId}
              onClick={confirmSwitch}
            >
              Yes, send my money here
            </Button>
          </>
        }
      >
        {switching && (
          <Box className="space-y-3">
            <Text className="text-sm text-ink-2">
              Every settlement from now on will be paid to:
            </Text>
            <Box className="p-3 rounded-panel border border-line bg-surface-subtle">
              <Strong className="text-ink tabular">{masked(switching.accountLast4)}</Strong>
              <Text className="text-label text-ink-2 mt-0.5">
                {switching.accountHolderName}
                {switching.ifscCode ? ` · ${switching.ifscCode}` : ''}
              </Text>
            </Box>
            {active && (
              <Text className="text-label text-ink-3">
                The account ending {active.accountLast4} will stop receiving them. Money already
                sent is not affected.
              </Text>
            )}
          </Box>
        )}
      </Modal>

      {/* ── Confirm a removal ──────────────────────────────────────────── */}
      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove the account ending ${removing?.accountLast4 ?? ''}?`}
        description="It is not the account you are being paid into, so nothing about your settlements changes."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              loading={busyId === removing?.accountId}
              onClick={confirmRemove}
            >
              Remove it
            </Button>
          </>
        }
      >
        <Text className="text-sm text-ink-2">
          To use it again later you will have to type the account number in full — Lampose does not
          keep it in a form that can be shown back to you.
        </Text>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
};
