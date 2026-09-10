/* ══════════════════════════════════════════════════════════════════════════
   Support — one queue, three apps, and a conversation with a person in it.

   Every ticket a diner, a rider or a restaurant files arrives here. The three
   apps reach the same collection through three routers, each of which can only
   ever see its own author's threads; this screen is the only place that sees
   all of them.

   ## Two panes, because they answer different questions

   The list answers "who is waiting", the thread answers "what do I say". They
   are on screen together rather than as a list and a drawer, because somebody
   working a queue moves between threads constantly, and a drawer that has to
   be closed to see the next row makes that a two-click loop all day.

   ## The list is sorted OLDEST first, and that is deliberate

   The server does it, and it is worth restating here because it looks like a
   bug to anybody used to a feed. The queue's question is "who has been waiting
   longest"; newest-first buries the person on day three under everybody who
   wrote in this morning. Closed threads sort the usual way, because browsing
   history is a different activity.

   ## Live, but never dependent on live

   A socket carries new tickets and new messages so a reply lands mid-sentence
   rather than on the next poll — support is the one screen in this console
   where the other end is a person waiting, and a thirty-second gap reads as
   nobody being there. Everything it delivers is also on the poll, and the
   header says which of the two is actually working rather than implying a
   freshness the page cannot promise.

   ## What this screen will not do

   It cannot delete a thread or edit a message. A support thread is the record
   of a complaint, and a complaint the complained-about can erase is not a
   record. `closed` is what "we are done" means, and it is reversible.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Clock,
  Home,
  Inbox,
  Phone,
  RefreshCw,
  Send,
  ShieldAlert,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { Badge } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { Input } from '../components/common/atoms/Input';
import { Select } from '../components/common/atoms/Select';
import { Skeleton } from '../components/common/atoms/Skeleton';
import { Textarea } from '../components/common/atoms/Textarea';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { cx } from '../components/common/utils';
import {
  supportService,
  type QueueQuery,
  type RequesterKind,
  type SupportThread,
  type TicketStatus,
} from '../api/services/supportService';
import {
  connectSupportSocket,
  onSupportMessage,
  onTicketOpened,
  onTicketUpdated,
  supportSocketConnected,
  trackTicket,
  untrackTicket,
} from '../lib/supportSocket';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../lib/useFetch';

import { QueueRow } from '../components/support/molecules/QueueRow';
import { AUDIENCE_LABEL, STATUS_TONE, STATUS_LABEL, since, clockTime } from '../components/support/utils';
import { Box } from '../components/common/atoms/Box';
import { Heading } from '../components/common/atoms/Heading';
import { Inline } from '../components/common/atoms/Inline';
import { Link } from '../components/common/atoms/Link';
import { Option } from '../components/common/atoms/Option';
import { PlainButton } from '../components/common/atoms/PlainButton';
import { Text } from '../components/common/atoms/Text';
interface SupportPageProps {
  search: string;
}

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */









export const SupportPage: React.FC<SupportPageProps> = ({ search }) => {
  const { user } = useAuth();

  /** Roles that may WRITE. Reading is wider — the backend enforces both. */
  const canAnswer = ['Super Admin', 'Admin', 'Support'].includes(String(user?.role));

  const [audience, setAudience] = useState<RequesterKind | ''>('');
  const [status, setStatus] = useState<TicketStatus | 'active' | ''>('active');
  const [assigned, setAssigned] = useState<'me' | 'unassigned' | 'any' | ''>('');
  const [kind, setKind] = useState<'ticket' | 'report' | ''>('');

  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [threadBusy, setThreadBusy] = useState(false);
  const [threadError, setThreadError] = useState('');

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [resolving, setResolving] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [live, setLive] = useState(false);

  const query: QueueQuery = useMemo(() => ({
    audience, status, assigned, kind, q: search, limit: 60,
  }), [audience, status, assigned, kind, search]);

  const queue = useFetch(() => supportService.list(query), [query]);
  const stats = useFetch(() => supportService.stats(), []);

  const rows = queue.data?.rows ?? [];

  /* Reload without the closure staleness: the socket handlers below live for
     the life of the component and would otherwise capture the first `reload`. */
  const reloadRef = useRef(queue.reload);
  reloadRef.current = queue.reload;
  const statsReloadRef = useRef(stats.reload);
  statsReloadRef.current = stats.reload;

  /* ── The live line ───────────────────────────────────────────────── */

  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    connectSupportSocket(token);

    /* Polled rather than pushed, because socket.io's connect state changes
       without a React render and a stale "Live" badge is worse than none —
       it claims a freshness the page is not delivering. */
    const tick = setInterval(() => setLive(supportSocketConnected()), 2000);
    setLive(supportSocketConnected());

    const offOpened = onTicketOpened(() => {
      reloadRef.current();
      statsReloadRef.current();
    });
    const offUpdated = onTicketUpdated(() => reloadRef.current());

    return () => {
      clearInterval(tick);
      offOpened();
      offUpdated();
      /* The connection itself is deliberately left open: it is shared, and a
         disconnect here would drop it every time somebody switched tabs. */
    };
  }, []);

  /*
   * A message on the thread that is open, appended in place.
   *
   * Refetching the whole thread on every incoming message would work and would
   * also scroll-jump and blank the reply box mid-sentence. Appending is what
   * makes it read like a conversation. The guard on `reference` matters:
   * administrators are in the `support` room and therefore receive events for
   * every thread in the system, not only the open one.
   */
  useEffect(() => {
    const off = onSupportMessage((event) => {
      reloadRef.current();
      setThread((current) => {
        if (!current || current.reference !== event.reference || !event.message) return current;
        if (current.messages.some((m) => m.id === event.message!.id)) return current;
        return { ...current, messages: [...current.messages, event.message] };
      });
    });
    return off;
  }, []);

  /* Join and leave the thread room as the selection moves. */
  useEffect(() => {
    if (!selected) return undefined;
    trackTicket(selected);
    return () => untrackTicket(selected);
  }, [selected]);

  /* ── Opening a thread ────────────────────────────────────────────── */

  /*
   * Which open is the newest.
   *
   * Working a queue means clicking down a list, and two fetches in flight land
   * in whatever order the network decides. Without this guard a slower EARLIER
   * request overwrites a faster later one: the list highlights the row you
   * clicked second, the socket has joined that thread's room, and the pane
   * shows the first one — a different person's name, phone number and
   * allegation.
   *
   * That is not merely a display bug. `send()` posts to `thread.reference`, so
   * the reply written for one requester is written into the other's thread —
   * and this screen deliberately cannot edit or delete a message, so it stays
   * there. A counter is the cheapest correct fix; an AbortController would
   * also work but would have to be threaded through the service layer.
   */
  const openSeq = useRef(0);

  const openThread = useCallback(async (reference: string) => {
    const seq = openSeq.current + 1;
    openSeq.current = seq;

    setSelected(reference);
    setThreadBusy(true);
    setThreadError('');
    setDraft('');

    const res = await supportService.thread(reference);

    /* Somebody clicked another row while this was in flight. Drop the whole
       response — including the busy flag, which the newer request owns now. */
    if (openSeq.current !== seq) return;

    setThreadBusy(false);

    if (!res.success || !res.data) {
      setThreadError(res.message || 'We could not open that thread.');
      setThread(null);
      return;
    }
    setThread(res.data);

    /* Its own call, not a side effect of the GET — a refetch or a retry that
       silently cleared the mark would clear it for the whole team. */
    void supportService.markRead(reference).then(() => reloadRef.current());
  }, []);

  /*
     Open the first row on a fresh load, so the pane is never empty next to a
     list that has rows in it.

     Keyed on the first row's REFERENCE rather than on `rows`, which is a fresh
     array on every render and would re-run this effect continuously. The guard
     on `selected` would stop it doing anything after the first pass, but an
     effect that fires every render to decide to do nothing is one refactor
     away from firing every render and doing something.
  */
  const firstReference = rows.length ? rows[0].reference : null;
  useEffect(() => {
    if (!selected && firstReference) void openThread(firstReference);
  }, [firstReference, selected, openThread]);

  /* ── Actions ─────────────────────────────────────────────────────── */

  const send = async (hold = false) => {
    const body = draft.trim();
    if (!body || !thread || sending) return;

    setSending(true);
    const res = await supportService.reply(thread.reference, body, { hold });
    setSending(false);

    if (!res.success || !res.data) {
      setToast({ tone: 'crit', message: res.message || 'That did not send.' });
      return;
    }
    /* The SERVER's version of the thread, not an optimistic append. It knows
       what the reply did to the status and who it got assigned to, and showing
       a bubble while the chip beside it is wrong is worse than a half-second
       wait. */
    setThread(res.data);
    setDraft('');
    queue.reload();
    stats.reload();
  };

  const setStatusTo = async (next: TicketStatus, withOutcome?: string) => {
    if (!thread) return;
    const res = await supportService.update(thread.reference, {
      status: next,
      ...(withOutcome !== undefined ? { outcome: withOutcome } : {}),
    });
    if (!res.success || !res.data) {
      setToast({ tone: 'crit', message: res.message || 'That did not save.' });
      return;
    }
    setThread(res.data);
    setToast({ tone: 'good', message: `Marked ${STATUS_LABEL[next].toLowerCase()}.` });
    queue.reload();
    stats.reload();
  };

  const claim = async () => {
    if (!thread) return;
    const res = await supportService.assign(thread.reference);
    if (!res.success || !res.data) {
      setToast({ tone: 'crit', message: res.message || 'That did not save.' });
      return;
    }
    setThread({ ...thread, assignedToId: res.data.assignedToId, assignedToName: res.data.assignedToName });
    queue.reload();
  };

  /* ── Render ──────────────────────────────────────────────────────── */

  const counts = stats.data;

  return (
    <Box className="space-y-4">
      <PageHeader
        title="Support"
        description="Every ticket from the diner, rider and restaurant apps — in one queue."
        actions={(
          <Box className="flex items-center gap-2">
            {/* Says which transport is actually working. A page that showed
                "Live" while the socket was down would be claiming a freshness
                it is not delivering. */}
            <Badge tone={live ? 'good' : 'neutral'} icon={live ? Wifi : WifiOff}>
              {live ? 'Live' : 'Polling'}
            </Badge>
            <Button
              variant="secondary"
              icon={RefreshCw}
              onClick={() => { queue.reload(); stats.reload(); }}
            >
              Refresh
            </Button>
          </Box>
        )}
      />

      {/* The numbers, and each one is a filter. A count somebody cannot act on
          is decoration. */}
      {counts && (
        <Box className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(['customer', 'driver', 'restaurant', 'partner'] as RequesterKind[]).map((k) => (
            <PlainButton
              key={k}
              type="button"
              onClick={() => setAudience(audience === k ? '' : k)}
              className={cx(
                'rounded-lg border px-3 py-2 text-left transition-colors',
                audience === k
                  ? 'border-line-strong'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <Text className="text-micro text-ink-3">{AUDIENCE_LABEL[k]}</Text>
              <Text className="text-title">{counts.audiences[k] ?? 0}</Text>
            </PlainButton>
          ))}
          <PlainButton
            type="button"
            onClick={() => setKind(kind === 'report' ? '' : 'report')}
            className={cx(
              'rounded-lg border px-3 py-2 text-left transition-colors',
              kind === 'report'
                ? 'border-crit-border'
                : 'border-line hover:border-line-strong',
            )}
          >
            <Text className="text-micro text-ink-3">Safety reports</Text>
            <Text className={cx('text-title', counts.openReports > 0 && 'text-crit')}>
              {counts.openReports}
            </Text>
          </PlainButton>
          <PlainButton
            type="button"
            onClick={() => setAssigned(assigned === 'unassigned' ? '' : 'unassigned')}
            className={cx(
              'rounded-lg border px-3 py-2 text-left transition-colors',
              assigned === 'unassigned'
                ? 'border-line-strong'
                : 'border-line hover:border-line-strong',
            )}
          >
            <Text className="text-micro text-ink-3">Nobody's</Text>
            <Text className="text-title">{counts.unassigned}</Text>
          </PlainButton>
        </Box>
      )}

      <Box className="grid gap-4 lg:grid-cols-[minmax(320px,380px)_1fr]">
        {/* ── The queue ─────────────────────────────────────────────── */}
        <Card padded={false} className="overflow-hidden">
          <Box className="flex flex-wrap gap-2 border-b border-line p-3">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as TicketStatus | 'active' | '')}
              className="flex-1"
            >
              <Option value="active">Still to do</Option>
              <Option value="open">Open</Option>
              <Option value="awaiting_customer">Waiting on them</Option>
              <Option value="resolved">Resolved</Option>
              <Option value="closed">Closed</Option>
              <Option value="">Everything</Option>
            </Select>
            <Select
              value={assigned}
              onChange={(e) => setAssigned(e.target.value as 'me' | 'unassigned' | 'any' | '')}
              className="flex-1"
            >
              <Option value="">Anyone's</Option>
              <Option value="me">Mine</Option>
              <Option value="unassigned">Nobody's</Option>
            </Select>
          </Box>

          <Box className="max-h-[70vh] overflow-y-auto">
            {queue.loading && !rows.length ? (
              <Box className="space-y-2 p-4">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </Box>
            ) : queue.error ? (
              <ErrorState message={queue.error} onRetry={queue.reload} />
            ) : !rows.length ? (
              <EmptyState
                icon={Inbox}
                title="Nothing waiting"
                description={
                  search
                    ? 'No thread matches that search.'
                    : 'Every ticket in this view has been dealt with.'
                }
              />
            ) : (
              rows.map((row) => (
                <QueueRow
                  key={row.reference}
                  row={row}
                  active={row.reference === selected}
                  onOpen={() => void openThread(row.reference)}
                />
              ))
            )}
          </Box>
        </Card>

        {/* ── The conversation ──────────────────────────────────────── */}
        <Card padded={false} className="flex min-h-[60vh] flex-col overflow-hidden">
          {threadBusy ? (
            <Box className="space-y-3 p-4">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-20 w-2/3" />
              <Skeleton className="h-20 w-2/3 self-end" />
            </Box>
          ) : threadError ? (
            <ErrorState message={threadError} onRetry={() => selected && void openThread(selected)} />
          ) : !thread ? (
            <EmptyState
              icon={Inbox}
              title="Pick a thread"
              description="Choose somebody from the queue to read what they said and answer them."
            />
          ) : (
            <>
              {/* Who, and how to reach them. A support screen without a phone
                  number on it is a screen somebody leaves to find one. */}
              <Box className="border-b border-line p-4">
                <Box className="flex flex-wrap items-start justify-between gap-3">
                  <Box className="min-w-0">
                    <Box className="flex flex-wrap items-center gap-2">
                      <Heading level={2} className="truncate text-body font-semibold">
                        {thread.requester.name}
                      </Heading>
                      <Badge tone="neutral">{AUDIENCE_LABEL[thread.requester.kind]}</Badge>
                      {thread.kind === 'report' && (
                        <Badge tone="crit" icon={ShieldAlert}>Safety report</Badge>
                      )}
                      <Badge tone={STATUS_TONE[thread.status]}>
                        {STATUS_LABEL[thread.status]}
                      </Badge>
                    </Box>
                    {/* "About the platform, or about this property?" — what the
                        student answered when they opened this. Set means the
                        owner named here can also read and reply to this
                        thread from Stay Partner; unset means this reached
                        admin alone, which is what a platform-category ticket
                        (a payment, the app itself) always does. */}
                    {thread.linkedPartnerId ? (
                      <Text className="mt-1 inline-flex items-center gap-1 text-micro text-warn">
                        <Home className="h-3 w-3" aria-hidden />
                        About a property — also visible to{' '}
                        {thread.linkedPartnerName || 'its owner'} in Stay Partner
                      </Text>
                    ) : (
                      <Text className="mt-1 text-micro text-ink-3">About the Lampose platform — admin only</Text>
                    )}
                    <Text className="mt-1 text-body text-ink-2">
                      {thread.subject}
                    </Text>
                    <Box className="mt-1 flex flex-wrap items-center gap-3 text-micro text-ink-3">
                      <Inline className="font-mono">{thread.reference}</Inline>
                      {thread.requester.phone && (
                        <Link
                          className="inline-flex items-center gap-1 hover:underline"
                          href={`tel:${thread.requester.phone}`}
                        >
                          <Phone className="h-3 w-3" aria-hidden />
                          {thread.requester.phone}
                        </Link>
                      )}
                      {thread.category && <Inline>About: {thread.category}</Inline>}
                      {thread.reason && <Inline>Reason: {thread.reason}</Inline>}
                      {thread.orderNumber && <Inline>Order {thread.orderNumber}</Inline>}
                      <Inline>Opened {since(thread.createdAt)} ago</Inline>
                    </Box>
                  </Box>

                  <Box className="flex shrink-0 flex-wrap gap-2">
                    {canAnswer && !thread.assignedToId && (
                      <Button variant="secondary" onClick={() => void claim()}>Claim</Button>
                    )}
                    {canAnswer && thread.status !== 'resolved' && thread.status !== 'closed' && (
                      <Button
                        variant="secondary"
                        icon={CheckCircle2}
                        onClick={() => { setOutcome(thread.outcome); setResolving(true); }}
                      >
                        Resolve
                      </Button>
                    )}
                    {canAnswer && thread.status !== 'closed' && (
                      <Button
                        variant="secondary"
                        icon={CircleSlash}
                        onClick={() => void setStatusTo('closed')}
                      >
                        Close
                      </Button>
                    )}
                  </Box>
                </Box>

                {thread.assignedToName && (
                  <Text className="mt-2 text-micro text-ink-3">
                    Held by {thread.assignedToName}
                  </Text>
                )}
                {thread.evidenceRequired && (
                  <Text className="mt-2 inline-flex items-center gap-1 text-xs text-warn">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    This reason needs evidence — chase for a photograph if none has arrived.
                  </Text>
                )}
              </Box>

              {/* The thread itself. */}
              <Box className="flex-1 space-y-3 overflow-y-auto p-4">
                {thread.messages.map((message) => {
                  if (message.author === 'system') {
                    /* A rule, not a bubble. A system line records what
                       HAPPENED; drawing it as speech lets a process guarantee
                       be mistaken for a person's promise. */
                    return (
                      <Box key={message.id} className="flex items-center gap-2 py-1">
                        <Inline className="h-px flex-1 bg-line" />
                        <Inline className="text-center text-micro text-ink-3">
                          {message.body}
                        </Inline>
                        <Inline className="h-px flex-1 bg-line" />
                      </Box>
                    );
                  }

                  const ours = message.author === 'support';
                  /* The one third voice: the property's owner, replying on a
                     ticket the STUDENT filed (see `linkedPartnerId`). Neither
                     "ours" nor the requester, so it gets its own name and its
                     own side — left, like the requester's, since it is not
                     Lampose speaking, but visually distinct so nobody reads it
                     as the student's own words. */
                  const fromPartner = message.author === 'partner';
                  const senderName = ours
                    ? (message.authorName || 'Support')
                    : fromPartner
                      ? (thread.linkedPartnerName || 'Property owner')
                      : thread.requester.name;
                  return (
                    <Box
                      key={message.id}
                      className={cx('flex', ours ? 'justify-end' : 'justify-start')}
                    >
                      <Box
                        className={cx(
                          'max-w-[80%] rounded-lg px-3 py-2',
                          ours
                            ? 'bg-brand text-white'
                            : fromPartner
                              ? 'bg-warn/10 border border-warn/30'
                              : 'bg-surface-inset',
                        )}
                      >
                        {fromPartner && (
                          <Text className="mb-0.5 text-micro font-medium text-warn">Property owner</Text>
                        )}
                        <Text className="whitespace-pre-wrap text-body">{message.body}</Text>
                        <Text className={cx('mt-1 text-micro', ours ? 'opacity-70' : 'text-ink-3')}>
                          {/* A NAME, because "Lampose Support" answers nobody.
                              Somebody chasing a deposit for three weeks who
                              gets four replies signed the same way cannot tell
                              whether anyone is holding it. */}
                          {senderName}
                          {' · '}
                          {clockTime(message.at)}
                        </Text>
                      </Box>
                    </Box>
                  );
                })}
              </Box>

              {/* The reply box. */}
              <Box className="border-t border-line p-3">
                {!canAnswer ? (
                  <Text className="text-body text-ink-3">
                    Your role can read this queue but not answer it. Answering needs
                    the Admin or Support role.
                  </Text>
                ) : thread.status === 'closed' ? (
                  /* Say why the box is gone rather than showing a dead one.
                     The server refuses a reply into a closed thread with a 409,
                     and a text area that takes a paragraph and then loses it is
                     the worst version of that rule. */
                  <Box className="flex flex-wrap items-center justify-between gap-2">
                    <Text className="text-body text-ink-3">
                      This thread is closed. Reopen it to say anything more.
                    </Text>
                    <Button variant="secondary" onClick={() => void setStatusTo('open')}>
                      Reopen
                    </Button>
                  </Box>
                ) : (
                  <Box className="space-y-2">
                    <Textarea
                      rows={3}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={`Reply to ${thread.requester.name}…`}
                      onKeyDown={(e) => {
                        /* Ctrl/⌘+Enter sends; plain Enter is a newline. A
                           support reply is a paragraph more often than a line,
                           and Enter-to-send truncates people mid-thought. */
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <Box className="flex flex-wrap items-center justify-between gap-2">
                      <Text className="text-micro text-ink-3">
                        {thread.status === 'open'
                          ? 'Sending moves this to “Waiting on them”.'
                          : 'Ctrl+Enter to send.'}
                      </Text>
                      <Box className="flex gap-2">
                        {thread.status === 'open' && (
                          /* For "we are looking into it" — a holding reply
                             should not take the ticket off the active queue
                             while the work is still ours. */
                          <Button
                            variant="secondary"
                            disabled={!draft.trim() || sending}
                            onClick={() => void send(true)}
                          >
                            Send &amp; keep open
                          </Button>
                        )}
                        <Button
                          icon={Send}
                          disabled={!draft.trim() || sending}
                          onClick={() => void send()}
                        >
                          {sending ? 'Sending…' : 'Send'}
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                )}
              </Box>
            </>
          )}
        </Card>
      </Box>

      {/* Resolving asks for the OUTCOME in the queue's own words. A list of
          rows all reading "Resolved" is a list somebody has to open one by one
          to learn anything from — and they will not, they will open a second
          ticket about the same thing. */}
      <Modal
        open={resolving}
        onClose={() => setResolving(false)}
        title="Resolve this thread"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setResolving(false)}>Cancel</Button>
            <Button
              icon={CheckCircle2}
              onClick={() => { setResolving(false); void setStatusTo('resolved', outcome.trim()); }}
            >
              Mark resolved
            </Button>
          </>
        )}
      >
        <Field
          label="What actually happened"
          hint="The requester reads this on their list. “Refunded ₹1,000 on 14 Mar” tells them something; “Resolved” does not."
        >
          <Input
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            maxLength={140}
            placeholder="Refunded ₹1,000 — arrived 14 Mar"
          />
        </Field>
        <Text className="mt-2 flex items-center gap-1 text-micro text-ink-3">
          <Clock className="h-3 w-3" aria-hidden />
          Resolved threads can still be replied to. Use Close when it is finished.
        </Text>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};

export default SupportPage;
