/* ══════════════════════════════════════════════════════════════════════════
   Request a payout — the button, and the history under it.

   ## Why the balance is not the Earnings total

   The Earnings page says what the kitchen EARNED. This says what Lampose can
   SEND, and the two differ by the orders where a diner collected at the
   counter and paid cash — that money went into the restaurant's own till and
   Lampose never held it. Paying it would be paying twice.

   That difference is the first thing an owner would otherwise write in and
   ask about, so it is not left to be discovered: `collectedByYou` is drawn
   on the screen with the reason beside it, rather than the two pages quietly
   disagreeing by a few hundred rupees.

   ## The request dialog names the account, and can change it for one payout

   The saved account marked active is the default. An owner can send a single
   payout somewhere else without changing their standing preference — a
   reasonable thing to want, and the alternative is switching the active
   account, requesting, and remembering to switch back.

   ## Nothing here promises a date

   A request goes to a person, who makes a bank transfer and types the
   reference in. There is no automatic dispatch, so the screen says
   "Lampose will review this" and not "arrives in 2 days". A promise the
   system cannot keep is worse than no promise: the owner plans around it.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Ban,
  Banknote,
  CheckCircle2,
  Clock,
  Hourglass,
  Info,
  Wallet,
} from 'lucide-react';
import { Badge } from '../../../common/atoms/Badge';
import type { BadgeTone } from '../../../common/atoms/Badge';
import { Box } from '../../../common/atoms/Box';
import { Button } from '../../../common/atoms/Button';
import { Card } from '../../../common/atoms/Card';
import { Heading } from '../../../common/atoms/Heading';
import { Inline } from '../../../common/atoms/Inline';
import { PlainButton } from '../../../common/atoms/PlainButton';
import { PlainTd, PlainTr, TableBody, TableHead } from '../../../common/atoms/PlainTable';
import { Strong } from '../../../common/atoms/Strong';
import { Table, Td, Th, Tr } from '../../../common/atoms/Table';
import { Text } from '../../../common/atoms/Text';
import { EmptyState } from '../../../common/molecules/EmptyState';
import { ErrorState } from '../../../common/molecules/ErrorState';
import { Modal } from '../../../common/organisms/Modal';
import { Toast } from '../../../common/organisms/Toast';
import type { ToastState } from '../../../common/organisms/Toast';
import { cx } from '../../../common/utils';
import { restaurantAdminService } from '../../../../api/services/restaurantAdminService';
import type { FoodPayoutStatus, PayoutAccount } from '../../../../api/services/restaurantAdminService';
import { useFetch } from '../../../../lib/useFetch';
import { formatDate, rupees } from '../../../../lib/format';

const STATUS_LOOK: Record<FoodPayoutStatus, { label: string; tone: BadgeTone; icon: React.ElementType }> = {
  pending: { label: 'With Lampose', tone: 'warn', icon: Hourglass },
  paid: { label: 'Paid', tone: 'good', icon: CheckCircle2 },
  rejected: { label: 'Refused', tone: 'crit', icon: Ban },
};

const masked = (last4?: string): string => (last4 ? `•••• ${last4}` : '—');

export const PayoutRequest: React.FC = () => {
  const overview = useFetch(() => restaurantAdminService.payouts(), []);
  /* The accounts are read here too, so the dialog can offer a choice without
     the caller having to pass them down. One extra indexed read on a screen
     opened a few times a week. */
  const accountList = useFetch(() => restaurantAdminService.payoutAccounts(), []);

  const [asking, setAsking] = useState(false);
  const [chosen, setChosen] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const data = overview.data;
  const balance = data?.balance;
  const minimum = data?.minimum ?? 100;
  const accounts = accountList.data?.accounts ?? [];
  const active = accounts.find((a) => a.isActive) ?? null;

  const available = balance?.available ?? 0;
  const canRequest = available >= minimum && accounts.length > 0 && (balance?.pendingRequests ?? 0) === 0;

  const openDialog = () => {
    setChosen(active?.accountId ?? accounts[0]?.accountId ?? '');
    setError(null);
    setAsking(true);
  };

  const send = async () => {
    setSending(true);
    setError(null);
    const res = await restaurantAdminService.requestPayout(chosen || undefined);
    setSending(false);

    if (res.success) {
      setToast({
        tone: 'good',
        message: `Requested ${rupees(res.data?.amount ?? 0)}. Lampose will settle it and record the transfer reference here.`,
      });
      setAsking(false);
      overview.reload();
      return;
    }
    /* Held in the dialog rather than thrown as a toast — every one of these
       refusals tells the owner something they need to act on, and a toast
       that fades in four seconds is the wrong place for it. */
    setError(res.message || 'That request could not be made.');
  };

  /** Why the button is not pressable, in the owner's terms. */
  const blockedBecause = (): string | null => {
    if (overview.loading) return null;
    if (accounts.length === 0) return 'Add a bank account first — Lampose has nowhere to send it.';
    if ((balance?.pendingRequests ?? 0) > 0) {
      return 'You already have a payout with Lampose. You can request again once it is settled.';
    }
    if (available <= 0) return 'Nothing to pay out yet.';
    if (available < minimum) {
      return `Payouts start at ${rupees(minimum)}. You have ${rupees(available)} waiting — it will keep adding up.`;
    }
    return null;
  };

  const blocked = blockedBecause();
  const history = data?.history ?? [];
  const chosenAccount: PayoutAccount | undefined = accounts.find((a) => a.accountId === chosen);

  return (
    <Box className="space-y-5">
      {/* ── The balance and the button ─────────────────────────────────── */}
      <Card className="p-4">
        <Box className="flex flex-wrap items-start justify-between gap-4">
          <Box className="flex items-start gap-3 min-w-0">
            <Inline className="grid place-items-center size-9 rounded-control bg-brand-soft text-brand-ink shrink-0">
              <Wallet className="size-4" strokeWidth={1.75} />
            </Inline>
            <Box className="min-w-0">
              <Text className="text-label uppercase text-ink-3">Ready to pay out</Text>
              <Text className="text-display text-ink figure mt-0.5">
                {overview.loading ? '—' : rupees(available)}
              </Text>
              <Text className="text-label text-ink-3 mt-0.5 tabular">
                {balance?.availableOrders ?? 0} delivered order
                {(balance?.availableOrders ?? 0) === 1 ? '' : 's'}
                {active ? ` · into ${masked(active.accountLast4)}` : ''}
              </Text>
            </Box>
          </Box>

          <Box className="shrink-0">
            <Button
              variant="primary"
              icon={ArrowRight}
              onClick={openDialog}
              disabled={!canRequest}
              title={blocked ?? undefined}
            >
              Request payout
            </Button>
          </Box>
        </Box>

        {blocked && (
          <Box className="flex items-start gap-2 mt-3 pt-3 border-t border-line text-label text-ink-3">
            <Info className="size-3.5 shrink-0 mt-0.5" strokeWidth={2} />
            {blocked}
          </Box>
        )}

        {/* The three figures that are NOT in the balance, each with its
            reason. Without these the owner is left comparing this screen
            against Earnings and finding they disagree. */}
        {balance && (
          <Box className="grid sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-line">
            <Box>
              <Text className="text-label uppercase text-ink-3">With Lampose</Text>
              <Text className="text-body font-medium text-ink tabular mt-0.5">
                {rupees(balance.pending)}
              </Text>
              <Text className="text-label text-ink-3">already requested, being settled</Text>
            </Box>
            <Box>
              <Text className="text-label uppercase text-ink-3">Still cooking</Text>
              <Text className="text-body font-medium text-ink tabular mt-0.5">
                {rupees(balance.inProgress)}
              </Text>
              <Text className="text-label text-ink-3">
                {balance.inProgressOrders} order{balance.inProgressOrders === 1 ? '' : 's'} not
                delivered yet
              </Text>
            </Box>
            <Box>
              <Text className="text-label uppercase text-ink-3">You collected</Text>
              <Text className="text-body font-medium text-ink tabular mt-0.5">
                {rupees(balance.collectedByYou)}
              </Text>
              {/* The clause somebody will ask about. Answered before they do. */}
              <Text className="text-label text-ink-3">
                cash taken at your counter — already yours
              </Text>
            </Box>
          </Box>
        )}

        {overview.error && (
          <Box className="mt-3">
            <ErrorState message={overview.error} onRetry={overview.reload} />
          </Box>
        )}
      </Card>

      {/* ── History ────────────────────────────────────────────────────── */}
      <Box>
        <Heading level={2} className="text-label uppercase text-ink-3 mb-2">
          Payout requests
        </Heading>
        <Card>
          <Table>
            <TableHead>
              <Tr>
                <Th>Requested</Th>
                <Th className="text-right">Amount</Th>
                <Th>Into</Th>
                <Th>State</Th>
                <Th>Reference</Th>
              </Tr>
            </TableHead>
            <TableBody>
              {history.length === 0 ? (
                <PlainTr>
                  <PlainTd colSpan={5}>
                    <EmptyState
                      icon={Banknote}
                      title="No payouts requested yet"
                      description="When you have earned enough, request a payout and it will appear here with its transfer reference once Lampose has sent it."
                    />
                  </PlainTd>
                </PlainTr>
              ) : (
                history.map((row) => {
                  const look = STATUS_LOOK[row.status] ?? STATUS_LOOK.pending;
                  return (
                    <Tr key={row.payoutId}>
                      <Td>
                        <Text className="text-ink tabular">{formatDate(row.requestedAt)}</Text>
                        <Text className="text-label text-ink-3 tabular">
                          {row.orderCount} order{row.orderCount === 1 ? '' : 's'}
                        </Text>
                      </Td>
                      <Td className="text-right">
                        <Strong className="text-ink tabular">{rupees(row.amount)}</Strong>
                      </Td>
                      <Td className="tabular">{masked(row.account?.accountLast4)}</Td>
                      <Td>
                        <Badge tone={look.tone} icon={look.icon}>
                          {look.label}
                        </Badge>
                        {row.status === 'paid' && row.paidAt && (
                          <Text className="text-label text-ink-3 mt-0.5">
                            {formatDate(row.paidAt)}
                          </Text>
                        )}
                        {row.status === 'rejected' && row.rejectionReason && (
                          <Text className="text-label text-crit mt-0.5 max-w-xs">
                            {row.rejectionReason}
                          </Text>
                        )}
                      </Td>
                      <Td>
                        {row.reference ? (
                          <Text className="text-label text-ink-2 tabular break-all">
                            {row.reference}
                          </Text>
                        ) : (
                          <Text className="text-label text-ink-3">—</Text>
                        )}
                      </Td>
                    </Tr>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </Box>

      {/* ── The request dialog ─────────────────────────────────────────── */}
      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title="Request a payout"
        description="Lampose will make the transfer by hand and record the bank reference here."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Wallet} loading={sending} onClick={send}>
              Request {rupees(available)}
            </Button>
          </>
        }
      >
        <Box className="space-y-4">
          {error && (
            <Box
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-panel bg-crit-soft border border-crit-border"
            >
              <AlertCircle className="size-4 text-crit shrink-0 mt-0.5" strokeWidth={2} />
              <Text className="text-sm text-ink-2">{error}</Text>
            </Box>
          )}

          <Box className="p-3 rounded-panel border border-line bg-surface-subtle">
            <Text className="text-label uppercase text-ink-3">Amount</Text>
            <Text className="text-display text-ink figure mt-0.5">{rupees(available)}</Text>
            <Text className="text-label text-ink-3 mt-0.5 tabular">
              everything delivered and not yet paid out · {balance?.availableOrders ?? 0} order
              {(balance?.availableOrders ?? 0) === 1 ? '' : 's'}
            </Text>
          </Box>

          <Box>
            <Text className="text-label text-ink-2 mb-1.5">Pay into</Text>
            <Box className="space-y-2">
              {accounts.map((account) => {
                const picked = account.accountId === chosen;
                return (
                  <PlainButton
                    key={account.accountId}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    onClick={() => setChosen(account.accountId)}
                    className={cx(
                      'w-full text-left flex items-center gap-3 p-2.5 rounded-control border transition-colors duration-120',
                      picked
                        ? 'bg-brand-soft border-brand-border'
                        : 'bg-surface border-line hover:bg-surface-inset'
                    )}
                  >
                    <Inline
                      className={cx(
                        'grid place-items-center size-4 rounded-full border shrink-0',
                        picked ? 'border-brand bg-brand' : 'border-line-strong'
                      )}
                    >
                      {picked && <Inline className="size-1.5 rounded-full bg-white" />}
                    </Inline>
                    <Box className="min-w-0 flex-1">
                      <Text className="text-sm text-ink tabular">
                        {masked(account.accountLast4)}
                        {account.label ? ` · ${account.label}` : ''}
                      </Text>
                      <Text className="text-label text-ink-3 truncate">
                        {account.accountHolderName}
                        {account.ifscCode ? ` · ${account.ifscCode}` : ''}
                      </Text>
                    </Box>
                    {account.isActive && <Badge tone="neutral">Usual</Badge>}
                  </PlainButton>
                );
              })}
            </Box>
            {/* Only worth saying when it is actually the case. */}
            {chosenAccount && !chosenAccount.isActive && (
              <Text className="text-label text-ink-3 mt-2">
                This payout only. Your usual account is unchanged.
              </Text>
            )}
          </Box>

          <Box className="flex items-start gap-2 text-label text-ink-3">
            <Clock className="size-3.5 shrink-0 mt-0.5" strokeWidth={2} />
            {/* No date promised — see the file header. */}
            A person at Lampose reviews and transfers this. You will see the bank reference on this
            page once it has been sent.
          </Box>
        </Box>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
