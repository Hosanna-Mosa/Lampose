import React, { useMemo, useState } from 'react';
import {
  Ban,
  Briefcase,
  Building2,
  CircleCheck,
  KeyRound,
  UtensilsCrossed,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserX,
  X,
} from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import type { BadgeTone } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { IconButton } from '../components/common/atoms/IconButton';
import { Input } from '../components/common/atoms/Input';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { Textarea } from '../components/common/atoms/Textarea';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { Field } from '../components/common/molecules/Field';
import { FilterBar } from '../components/common/molecules/FilterBar';
import { FilterChips } from '../components/common/molecules/FilterChips';
import { ResultCount } from '../components/common/molecules/ResultCount';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { cx, filterBySearch } from '../components/common/utils';
import { foodAdminService } from '../api/services/foodAdminService';
import { insightsService } from '../api/services/insightsService';
import { scriperUserService } from '../api/services/scriperUserService';
import { verificationService } from '../api/services/verificationService';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../lib/useFetch';
import { propertyCategoryLabel, verificationMeta } from '../lib/domain';
import { formatDate, formatDateTime, percent } from '../lib/format';
import type {
  ApiResponse,
  FoodRestaurantRow,
  FoodVerificationStatus,
  OnboarderEntity,
  ScriperUserEntity,
  VerificationStatus,
} from '../api/types';
import { Aside } from '../components/common/atoms/Aside';
import { Box } from '../components/common/atoms/Box';
import { Code } from '../components/common/atoms/Code';
import { Form } from '../components/common/atoms/Form';
import { Heading } from '../components/common/atoms/Heading';
import { Inline } from '../components/common/atoms/Inline';
import { PlainTd, PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Region } from '../components/common/atoms/Region';
import { Text } from '../components/common/atoms/Text';

interface OnboardingTeamPageProps {
  search: string;
}

/** The server's floor for a staff password (scriperUser.admin.routes.js). */
const MIN_PASSWORD = 8;

/**
 * One person on the team: their funnel (from `verificationrequests`) joined to
 * their account (from `scriper_users`) by email. Either half can be missing —
 * an account that has not onboarded anything yet, or history left behind by
 * an account that was deleted.
 */
interface TeamRow {
  email: string;
  stats: OnboarderEntity;
  /** Null for non-Super-Admins (who cannot read accounts) and for deleted accounts. */
  account: ScriperUserEntity | null;
}

const noActivity = (email: string): OnboarderEntity => ({
  employeeEmail: email,
  total: 0,
  verified: 0,
  pending: 0,
  rejected: 0,
  failed: 0,
  expired: 0,
  successRate: null,
  restaurants: { total: 0, approved: 0, pending: 0, rejected: 0 },
  firstOnboardedAt: null,
  lastOnboardedAt: null,
});

type EmployeeFilter = 'all' | 'pending' | 'rejected' | 'failed' | 'unverified' | 'restaurants' | 'suspended';

/** Which employees each chip keeps — by what their funnel holds, since a row
 *  is a person, not a single request. */
const EMPLOYEE_FILTERS: {
  id: EmployeeFilter;
  label: string;
  tone?: BadgeTone;
  test: (r: TeamRow) => boolean;
  superAdminOnly?: boolean;
}[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'pending', label: 'Awaiting an outcome', tone: 'warn', test: (r) => r.stats.pending > 0 },
  { id: 'rejected', label: 'Has rejections', tone: 'crit', test: (r) => r.stats.rejected > 0 },
  { id: 'failed', label: 'Failed or expired', tone: 'crit', test: (r) => r.stats.failed + r.stats.expired > 0 },
  { id: 'unverified', label: 'None verified yet', tone: 'neutral', test: (r) => r.stats.verified === 0 },
  { id: 'restaurants', label: 'Onboards restaurants', tone: 'brand', test: (r) => r.stats.restaurants.total > 0 },
  {
    id: 'suspended',
    label: 'Suspended',
    tone: 'crit',
    test: (r) => r.account?.status === 'suspended',
    superAdminOnly: true,
  },
];

type AttemptFilter = 'all' | 'inflight' | 'verified' | 'rejected' | 'failed' | 'expired';

/** The same buckets the row's columns use (see OnboarderEntity), so the
 *  drawer's chip counts add up to the numbers on the row that opened it. */
const ATTEMPT_FILTERS: { id: AttemptFilter; label: string; tone?: BadgeTone; statuses: VerificationStatus[] | null }[] = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'inflight', label: 'In flight', tone: 'warn', statuses: ['pending', 'sent', 'delivered', 'owner_approved'] },
  { id: 'verified', label: 'Verified', tone: 'good', statuses: ['verified'] },
  { id: 'rejected', label: 'Rejected', tone: 'crit', statuses: ['rejected', 'verifier_rejected'] },
  { id: 'failed', label: 'Failed', tone: 'crit', statuses: ['failed'] },
  { id: 'expired', label: 'Expired', tone: 'neutral', statuses: ['expired'] },
];

const RESTAURANT_STATUS: Record<FoodVerificationStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'In review', tone: 'warn' },
  approved: { label: 'Approved', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'crit' },
};

const noRestaurants = (): Promise<ApiResponse<FoodRestaurantRow[]>> =>
  Promise.resolve({ data: [], success: true, status: 200, timestamp: new Date().toISOString() });

const AccountBadge: React.FC<{ account: ScriperUserEntity | null }> = ({ account }) =>
  !account ? (
    <Badge tone="neutral" icon={UserX}>
      No account
    </Badge>
  ) : account.status === 'suspended' ? (
    <Badge tone="crit" icon={Ban}>
      Suspended
    </Badge>
  ) : (
    <Badge tone="good" icon={CircleCheck}>
      Active
    </Badge>
  );

const EMPTY_CREATE = { name: '', email: '', password: '' };

export const OnboardingTeamPage: React.FC<OnboardingTeamPageProps> = ({ search }) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'Super Admin';

  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [filter, setFilter] = useState<EmployeeFilter>('all');
  // The drawer's own search and outcome filter, reset whenever a row opens.
  const [attemptSearch, setAttemptSearch] = useState('');
  const [attemptFilter, setAttemptFilter] = useState<AttemptFilter>('all');

  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [createError, setCreateError] = useState<string | null>(null);
  /** Shown once after the server generates a password; there is no way to read it again. */
  const [issuedPassword, setIssuedPassword] = useState<{ email: string; password: string } | null>(null);

  const [editing, setEditing] = useState<ScriperUserEntity | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '' });
  const [editError, setEditError] = useState<string | null>(null);

  const [suspending, setSuspending] = useState<ScriperUserEntity | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [deleting, setDeleting] = useState<ScriperUserEntity | null>(null);

  const openEmployee = (r: TeamRow) => {
    setAttemptSearch('');
    setAttemptFilter('all');
    setSelectedEmail(r.email);
  };

  const onboarders = useFetch(() => insightsService.getOnboarders(), []);
  /* Accounts are Super-Admin-only on the server; everyone else sees the funnel alone. */
  const accounts = useFetch(
    (): Promise<ApiResponse<ScriperUserEntity[]>> =>
      isSuperAdmin
        ? scriperUserService.getScriperUsers()
        : Promise.resolve({ data: [], success: true, status: 200, timestamp: new Date().toISOString() }),
    [isSuperAdmin]
  );

  const loading = onboarders.loading || accounts.loading;
  const refreshing = onboarders.refreshing || accounts.refreshing;
  const error = onboarders.error || accounts.error;
  const reload = () => {
    onboarders.reload();
    restaurantDetail.reload();
    accounts.reload();
  };

  /* Everyone with onboarding history, plus every EMPLOYEE account that has
     none yet — a new hire belongs on this page before their first listing.
     Leads-panel ADMIN accounts with no onboarding stay on Leads Panel Team. */
  const team = useMemo<TeamRow[]>(() => {
    const byEmail = new Map<string, ScriperUserEntity>();
    for (const a of accounts.data ?? []) byEmail.set(a.email.toLowerCase(), a);

    const rows: TeamRow[] = (onboarders.data ?? []).map((o) => {
      const email = o.employeeEmail.toLowerCase();
      return { email: o.employeeEmail, stats: o, account: byEmail.get(email) ?? null };
    });
    const seen = new Set(rows.map((r) => r.email.toLowerCase()));
    for (const a of accounts.data ?? []) {
      if (a.role === 'EMPLOYEE' && !seen.has(a.email.toLowerCase())) {
        rows.push({ email: a.email, stats: noActivity(a.email), account: a });
      }
    }
    return rows;
  }, [onboarders.data, accounts.data]);

  const selected = useMemo(
    () => (selectedEmail ? team.find((r) => r.email === selectedEmail) ?? null : null),
    [team, selectedEmail]
  );

  const visibleFilters = EMPLOYEE_FILTERS.filter((f) => !f.superAdminOnly || isSuperAdmin);

  const searched = useMemo(
    () =>
      filterBySearch(team, search, (r, q) =>
        `${r.email} ${r.account?.name ?? ''}`.toLowerCase().includes(q)
      ),
    [team, search]
  );

  const rows = useMemo(() => {
    const test = EMPLOYEE_FILTERS.find((f) => f.id === filter)?.test ?? (() => true);
    return searched.filter(test);
  }, [searched, filter]);

  // One dimension only, so each chip simply counts the searched employees it keeps.
  const filterCounts = useMemo(
    () =>
      Object.fromEntries(EMPLOYEE_FILTERS.map((f) => [f.id, searched.filter(f.test).length])) as Record<
        EmployeeFilter,
        number
      >,
    [searched]
  );

  const filtered = !!search.trim() || filter !== 'all';

  const summary = useMemo(() => {
    const totals = team.reduce(
      (acc, { stats: o }) => {
        acc.onboards += o.total;
        acc.restaurants += o.restaurants.total;
        acc.verified += o.verified;
        acc.pending += o.pending;
        acc.terminal += o.verified + o.rejected + o.failed + o.expired;
        return acc;
      },
      { onboards: 0, restaurants: 0, verified: 0, pending: 0, terminal: 0 }
    );
    return {
      employees: team.length,
      onboards: totals.onboards,
      restaurants: totals.restaurants,
      pending: totals.pending,
      successRate: totals.terminal > 0 ? (totals.verified / totals.terminal) * 100 : null,
    };
  }, [team]);

  // The employee's full history — every onboarding attempt, not just the
  // counts already on the row. Loaded lazily, only once a row is opened.
  const detail = useFetch(
    () =>
      selectedEmail
        ? verificationService.getVerifications({ employeeEmail: selectedEmail })
        : Promise.resolve({ data: [], success: true, status: 200, timestamp: new Date().toISOString() }),
    [selectedEmail]
  );

  // The restaurants they filled in on the Onboard console, also loaded lazily.
  const restaurantDetail = useFetch(
    () =>
      selectedEmail
        ? foodAdminService.getRestaurants({ onboardedBy: selectedEmail, status: 'all' })
        : noRestaurants(),
    [selectedEmail]
  );

  const attemptsSearched = useMemo(
    () =>
      filterBySearch(detail.data ?? [], attemptSearch, (v, q) =>
        [v.property?.name, v.property?.place, v.property?.ownerName, v.ownerMobileE164, verificationMeta(v.status).label]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q))
      ),
    [detail.data, attemptSearch]
  );

  const attemptCounts = useMemo(
    () =>
      Object.fromEntries(
        ATTEMPT_FILTERS.map((f) => [
          f.id,
          f.statuses ? attemptsSearched.filter((v) => f.statuses?.includes(v.status)).length : attemptsSearched.length,
        ])
      ) as Record<AttemptFilter, number>,
    [attemptsSearched]
  );

  const attempts = useMemo(() => {
    const statuses = ATTEMPT_FILTERS.find((f) => f.id === attemptFilter)?.statuses;
    return statuses ? attemptsSearched.filter((v) => statuses.includes(v.status)) : attemptsSearched;
  }, [attemptsSearched, attemptFilter]);

  /* ── Account actions (Super Admin) ── */

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setCreateError(null);
    const res = await scriperUserService.createScriperUser({
      name: createForm.name.trim(),
      email: createForm.email.trim().toLowerCase(),
      role: 'EMPLOYEE',
      ...(createForm.password && { password: createForm.password }),
    });
    setBusy(false);

    if (res.success && res.data) {
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE);
      if (res.data.temporaryPassword) {
        setIssuedPassword({ email: res.data.email, password: res.data.temporaryPassword });
      } else {
        setToast({ tone: 'good', message: `${res.data.name} can now sign in to the onboarding app.` });
      }
      accounts.reload();
    } else {
      setCreateError(res.message || 'Could not create the account.');
    }
  };

  const openEdit = (a: ScriperUserEntity) => {
    setEditing(a);
    setEditForm({ name: a.name, email: a.email, password: '' });
    setEditError(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setEditError(null);
    const email = editForm.email.trim().toLowerCase();
    const res = await scriperUserService.updateScriperUser(editing.id, {
      name: editForm.name.trim(),
      email,
      ...(editForm.password && { password: editForm.password }),
    });
    setBusy(false);

    if (res.success) {
      setToast({
        tone: 'good',
        message: editForm.password
          ? `${editForm.name} updated. Their password was reset and every device signed out.`
          : `${editForm.name} updated.`,
      });
      /* Changing the email moves the row; keep the drawer on the same person. */
      if (selectedEmail === editing.email && email !== editing.email) setSelectedEmail(email);
      setEditing(null);
      accounts.reload();
    } else {
      setEditError(res.message || 'Update failed.');
    }
  };

  const handleSuspend = async () => {
    if (!suspending) return;
    setBusy(true);
    const res = await scriperUserService.suspendScriperUser(suspending.id, suspendReason.trim());
    setBusy(false);
    if (res.success) {
      setToast({ tone: 'good', message: `${suspending.name} is suspended and has been signed out everywhere.` });
      accounts.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Could not suspend the account.' });
    }
    setSuspending(null);
  };

  const handleReactivate = async (a: ScriperUserEntity) => {
    setBusy(true);
    const res = await scriperUserService.reactivateScriperUser(a.id);
    setBusy(false);
    if (res.success) {
      setToast({ tone: 'good', message: `${a.name} can sign in again.` });
      accounts.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Could not reactivate the account.' });
    }
  };

  const handleSignOut = async (a: ScriperUserEntity) => {
    setBusy(true);
    const res = await scriperUserService.signOutScriperUser(a.id);
    setBusy(false);
    setToast(
      res.success
        ? { tone: 'good', message: `${a.name} was signed out of every device.` }
        : { tone: 'crit', message: res.message || 'Could not sign the account out.' }
    );
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    const res = await scriperUserService.deleteScriperUser(deleting.id);
    setBusy(false);
    if (res.success) {
      setToast({ tone: 'good', message: `${deleting.name}'s account was deleted. Their onboarding history is kept.` });
      accounts.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Delete failed.' });
    }
    setDeleting(null);
  };

  const columns = isSuperAdmin ? 9 : 8;

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="Records"
        title="Onboarding Team"
        description={
          isSuperAdmin
            ? 'Everyone who can onboard properties: their account, and their full funnel — not just the onboards that ended up verified. Open a row to edit, suspend or remove someone.'
            : 'Every employee who has onboarded a property, with their full funnel — not just the ones that ended up verified. Sourced from the verificationrequests collection, the only place an onboarding attempt is recorded regardless of outcome.'
        }
        actions={
          <>
            <IconButton icon={RefreshCw} label="Reload onboarding team" onClick={reload} spinning={refreshing || loading} />
            {isSuperAdmin && (
              <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
                Add team member
              </Button>
            )}
          </>
        }
      />

      <Box className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Team members', value: summary.employees, tone: 'text-ink' },
          { label: 'Properties onboarded', value: summary.onboards, tone: 'text-ink' },
          { label: 'Restaurants onboarded', value: summary.restaurants, tone: 'text-ink' },
          { label: 'Awaiting an outcome', value: summary.pending, tone: 'text-warn' },
          {
            label: 'Overall success rate',
            value: summary.successRate === null ? '—' : percent(summary.successRate, 0),
            tone: 'text-good',
          },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <Text className="text-label text-ink-2">{s.label}</Text>
            <Text className={cx('text-metric figure mt-2', s.tone)}>{loading ? '—' : s.value}</Text>
          </Card>
        ))}
      </Box>

      <Card padded={false} className="p-3">
        <FilterBar
          summary={
            loading ? undefined : (
              <ResultCount
                shown={rows.length}
                total={team.length}
                noun="employees"
                filtered={filtered}
                onClear={filter !== 'all' ? () => setFilter('all') : undefined}
              />
            )
          }
        >
          <FilterChips
            label="Funnel"
            value={filter}
            onChange={setFilter}
            options={visibleFilters.map((f) => ({
              id: f.id,
              label: f.label,
              count: loading ? null : filterCounts[f.id],
              tone: f.tone,
            }))}
          />
        </FilterBar>
      </Card>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <Card padded={false}>
          <Table>
            <TableHead>
              <PlainTr>
                <Th>Employee</Th>
                {isSuperAdmin && <Th>Account</Th>}
                <Th className="text-right">Properties</Th>
                <Th className="text-right">Verified</Th>
                <Th className="text-right">Pending</Th>
                <Th className="text-right">Rejected</Th>
                <Th className="text-right">Success rate</Th>
                <Th className="text-right">Restaurants</Th>
                <Th>Last onboarded</Th>
              </PlainTr>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableSkeleton cols={columns} />
              ) : !rows.length ? (
                <PlainTr>
                  <PlainTd colSpan={columns}>
                    <EmptyState
                      icon={Briefcase}
                      title={filtered ? 'No employees match these filters' : 'No onboarding team yet'}
                      description={
                        filtered
                          ? 'Try a different search or funnel filter.'
                          : isSuperAdmin
                            ? 'Add a team member to give them access to the onboarding app.'
                            : 'Rows appear here once an employee submits their first property for onboarding.'
                      }
                      action={
                        filter !== 'all' ? (
                          <Button variant="secondary" icon={X} onClick={() => setFilter('all')}>
                            Clear filters
                          </Button>
                        ) : undefined
                      }
                    />
                  </PlainTd>
                </PlainTr>
              ) : (
                rows.map((r) => (
                  <Tr key={r.email} className="cursor-pointer" onClick={() => openEmployee(r)}>
                    <Td>
                      <Box className="min-w-0">
                        <Inline className="block text-sm font-medium text-ink hover:text-brand-ink transition-colors truncate">
                          {r.account?.name ?? r.email}
                        </Inline>
                        {r.account && <Text className="text-label text-ink-3 truncate">{r.email}</Text>}
                      </Box>
                    </Td>
                    {isSuperAdmin && (
                      <Td>
                        <AccountBadge account={r.account} />
                      </Td>
                    )}
                    <Td className="text-right tabular">{r.stats.total}</Td>
                    <Td className="text-right tabular text-good">{r.stats.verified}</Td>
                    <Td className="text-right tabular text-warn">{r.stats.pending}</Td>
                    <Td className="text-right tabular text-crit">{r.stats.rejected}</Td>
                    <Td className="text-right tabular">
                      {r.stats.successRate === null ? '—' : percent(r.stats.successRate, 0)}
                    </Td>
                    <Td className="text-right tabular">
                      <Text className="text-sm text-ink">{r.stats.restaurants.total}</Text>
                      {r.stats.restaurants.total > 0 && (
                        <Text className="text-label text-ink-3">
                          <Inline className="text-good">{r.stats.restaurants.approved} approved</Inline>
                          {r.stats.restaurants.pending > 0 && ` · ${r.stats.restaurants.pending} in review`}
                        </Text>
                      )}
                    </Td>
                    <Td className="tabular">{formatDate(r.stats.lastOnboardedAt)}</Td>
                  </Tr>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Detail drawer — this employee's account and full onboarding history */}
      {selected && (
        <>
          <Box
            className="fixed inset-0 z-40 bg-[rgb(9_12_20/0.45)] backdrop-blur-[2px]"
            onClick={() => setSelectedEmail(null)}
            aria-hidden
          />
          <Aside
            role="dialog"
            aria-label="Employee onboarding detail"
            className="fixed top-0 bottom-0 right-0 z-50 w-full max-w-lg bg-surface border-l border-line flex flex-col anim-slide-left"
          >
            <Box className="h-14 px-4 border-b border-line flex items-center justify-between gap-3 shrink-0">
              <Box className="min-w-0">
                <Heading level={2} className="text-section text-ink truncate">
                  {selected.account?.name ?? selected.email}
                </Heading>
                <Text className="text-label text-ink-3 truncate">
                  {selected.account ? selected.email : 'Onboarding history'}
                </Text>
              </Box>
              <IconButton icon={X} label="Close" onClick={() => setSelectedEmail(null)} />
            </Box>

            <Box className="flex-1 overflow-y-auto p-4 space-y-5">
              {isSuperAdmin && (
                <Region className="p-3 rounded-control border border-line space-y-3">
                  <Box className="flex items-center justify-between gap-3">
                    <Heading level={3} className="text-micro uppercase text-ink-3">
                      Account
                    </Heading>
                    <AccountBadge account={selected.account} />
                  </Box>

                  {!selected.account ? (
                    <Text className="text-sm text-ink-3">
                      This email has no account any more — it was deleted. The history below is kept. Add a team
                      member with this email to give them access again.
                    </Text>
                  ) : (
                    <>
                      {selected.account.status === 'suspended' ? (
                        <Text className="text-sm text-ink-2">
                          Suspended {formatDateTime(selected.account.suspendedAt)}. They cannot sign in to the
                          onboarding app or the leads panel.
                          {selected.account.suspendedReason && (
                            <>
                              {' '}
                              Reason: <Inline className="text-ink">{selected.account.suspendedReason}</Inline>
                            </>
                          )}
                        </Text>
                      ) : (
                        <Text className="text-sm text-ink-2">
                          Can sign in to the onboarding app. Account created {formatDate(selected.account.createdAt)}.
                        </Text>
                      )}

                      <Box className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" icon={Pencil} onClick={() => openEdit(selected.account!)}>
                          Edit / reset password
                        </Button>
                        {selected.account.status === 'suspended' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={CircleCheck}
                            loading={busy}
                            onClick={() => handleReactivate(selected.account!)}
                          >
                            Reactivate
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={LogOut}
                              loading={busy}
                              onClick={() => handleSignOut(selected.account!)}
                            >
                              Sign out everywhere
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              icon={Ban}
                              onClick={() => {
                                setSuspendReason('');
                                setSuspending(selected.account);
                              }}
                            >
                              Suspend
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleting(selected.account)}>
                          Delete account
                        </Button>
                      </Box>
                    </>
                  )}
                </Region>
              )}

              <Heading level={3} className="text-micro uppercase text-ink-3 -mb-3">
                Properties
              </Heading>
              <Box className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total', value: selected.stats.total, tone: 'text-ink' },
                  { label: 'Verified', value: selected.stats.verified, tone: 'text-good' },
                  { label: 'Pending', value: selected.stats.pending, tone: 'text-warn' },
                  { label: 'Rejected', value: selected.stats.rejected, tone: 'text-crit' },
                ].map((s) => (
                  <Box key={s.label} className="p-2.5 rounded-control bg-surface-inset border border-line text-center">
                    <Text className={cx('text-section figure', s.tone)}>{s.value}</Text>
                    <Text className="text-micro uppercase text-ink-3 mt-0.5">{s.label}</Text>
                  </Box>
                ))}
              </Box>

              <Region>
                <Heading level={3} className="text-micro uppercase text-ink-3 mb-2 flex items-center gap-1.5">
                  <UtensilsCrossed className="size-3" strokeWidth={2} /> Restaurants onboarded
                </Heading>
                <Box className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { label: 'Total', value: selected.stats.restaurants.total, tone: 'text-ink' },
                    { label: 'Approved', value: selected.stats.restaurants.approved, tone: 'text-good' },
                    { label: 'In review', value: selected.stats.restaurants.pending, tone: 'text-warn' },
                    { label: 'Rejected', value: selected.stats.restaurants.rejected, tone: 'text-crit' },
                  ].map((s) => (
                    <Box key={s.label} className="p-2.5 rounded-control bg-surface-inset border border-line text-center">
                      <Text className={cx('text-section figure', s.tone)}>{s.value}</Text>
                      <Text className="text-micro uppercase text-ink-3 mt-0.5">{s.label}</Text>
                    </Box>
                  ))}
                </Box>
                {restaurantDetail.loading ? (
                  <Text className="text-sm text-ink-3">Loading…</Text>
                ) : restaurantDetail.error ? (
                  <Text className="text-sm text-crit">{restaurantDetail.error}</Text>
                ) : !restaurantDetail.data?.length ? (
                  <Text className="text-sm text-ink-3">No restaurants onboarded.</Text>
                ) : (
                  <Box className="space-y-2">
                    {restaurantDetail.data.map((f) => {
                      const meta = RESTAURANT_STATUS[f.verificationStatus] ?? RESTAURANT_STATUS.pending;
                      return (
                        <Box
                          key={f.restaurantId}
                          className="p-3 rounded-control border border-line flex items-start justify-between gap-3"
                        >
                          <Box className="min-w-0">
                            <Text className="text-sm font-medium text-ink truncate">
                              {f.restaurantName || 'Untitled restaurant'}
                            </Text>
                            <Text className="text-label text-ink-3 truncate">
                              {[f.ownerName, f.address?.city].filter(Boolean).join(' · ') || f.restaurantId}
                            </Text>
                            <Text className="text-label text-ink-3 mt-1">{formatDateTime(f.createdAt)}</Text>
                          </Box>
                          <Badge tone={meta.tone} className="shrink-0">
                            {meta.label}
                          </Badge>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Region>

              <Region>
                <Heading level={3} className="text-micro uppercase text-ink-3 mb-2 flex items-center gap-1.5">
                  <Building2 className="size-3" strokeWidth={2} /> Property onboarding attempts
                </Heading>

                {!detail.loading && !!detail.data?.length && (
                  <Box className="space-y-2 mb-3">
                    <FilterBar
                      search={{
                        value: attemptSearch,
                        onChange: setAttemptSearch,
                        placeholder: 'Search property, place, owner',
                      }}
                      summary={
                        <ResultCount
                          shown={attempts.length}
                          total={detail.data.length}
                          noun="attempts"
                          local
                          onClear={() => {
                            setAttemptSearch('');
                            setAttemptFilter('all');
                          }}
                        />
                      }
                    />
                    <FilterChips
                      label="Outcome"
                      value={attemptFilter}
                      onChange={setAttemptFilter}
                      options={ATTEMPT_FILTERS.map((f) => ({
                        id: f.id,
                        label: f.label,
                        count: attemptCounts[f.id],
                        tone: f.tone,
                      }))}
                    />
                  </Box>
                )}

                {detail.loading ? (
                  <Text className="text-sm text-ink-3">Loading…</Text>
                ) : !detail.data?.length ? (
                  <Text className="text-sm text-ink-3">No attempts on record.</Text>
                ) : !attempts.length ? (
                  <Text className="text-sm text-ink-3">No attempts match these filters.</Text>
                ) : (
                  <Box className="space-y-2">
                    {attempts.map((v) => {
                      const meta = verificationMeta(v.status);
                      return (
                        <Box
                          key={v.id}
                          className="p-3 rounded-control border border-line flex items-start justify-between gap-3"
                        >
                          <Box className="min-w-0">
                            <Text className="text-sm font-medium text-ink truncate">
                              {v.property?.name || 'Untitled property'}
                            </Text>
                            <Text className="text-label text-ink-3 truncate">
                              {v.property ? `${propertyCategoryLabel(v.property.category)} · ${v.property.place}` : v.ownerMobileE164}
                            </Text>
                            <Text className="text-label text-ink-3 mt-1">{formatDateTime(v.createdAt)}</Text>
                          </Box>
                          <Badge tone={meta.tone} icon={meta.icon} className="shrink-0">
                            {meta.label}
                          </Badge>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Region>
            </Box>
          </Aside>
        </>
      )}

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add team member"
        description="They sign in to the onboarding app with this email and password."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" form="create-team-member" type="submit" loading={busy}>
              Add member
            </Button>
          </>
        }
      >
        <Form id="create-team-member" onSubmit={handleCreate} className="space-y-4">
          {createError && (
            <Text className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
              {createError}
            </Text>
          )}
          <Field label="Full name" required>
            <Input
              required
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Email address" required>
            <Input
              required
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field
            label="Password"
            hint={`At least ${MIN_PASSWORD} characters. Leave blank and a random one is generated and shown once.`}
          >
            <Input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
            />
          </Field>
        </Form>
      </Modal>

      {/* The generated password — the only time anybody will see it */}
      <Modal
        open={!!issuedPassword}
        onClose={() => setIssuedPassword(null)}
        title="Account created"
        size="sm"
        footer={
          <Button variant="primary" onClick={() => setIssuedPassword(null)}>
            Done
          </Button>
        }
      >
        <Box className="space-y-3">
          <Text className="text-body text-ink-2">
            Give <Inline className="text-ink font-medium">{issuedPassword?.email}</Inline> this password. It will not be
            shown again; if it is lost, reset it from their row.
          </Text>
          <Box className="flex items-center gap-2 p-2.5 rounded-control bg-surface-inset border border-line">
            <KeyRound className="size-4 text-ink-3 shrink-0" strokeWidth={1.75} />
            <Code className="text-sm text-ink break-all select-all">{issuedPassword?.password}</Code>
          </Box>
        </Box>
      </Modal>

      {/* Edit */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" form="edit-team-member" type="submit" loading={busy}>
              Save changes
            </Button>
          </>
        }
      >
        <Form id="edit-team-member" onSubmit={handleUpdate} className="space-y-4">
          {editError && (
            <Text className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
              {editError}
            </Text>
          )}
          <Field label="Full name">
            <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field
            label="Email address"
            hint="Past onboards stay under the old email; only new ones use this address."
          >
            <Input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field label="Reset password" hint="Leave blank to keep it. A new password signs them out of every device.">
            <Input
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
            />
          </Field>
        </Form>
      </Modal>

      {/* Suspend */}
      <Modal
        open={!!suspending}
        onClose={() => setSuspending(null)}
        title={`Suspend ${suspending?.name ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSuspending(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={Ban} loading={busy} onClick={handleSuspend}>
              Suspend
            </Button>
          </>
        }
      >
        <Box className="space-y-4">
          <Text className="text-body text-ink-2">
            They are signed out of the onboarding app and the leads panel straight away and cannot sign back in until
            you reactivate them. Their onboarding history stays as it is, and properties already sent for verification
            carry on.
          </Text>
          <Field label="Reason" hint="Optional. Shown here to other Super Admins, not to them.">
            <Textarea rows={2} value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} maxLength={300} />
          </Field>
        </Box>
      </Modal>

      {/* Delete */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete account"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} loading={busy} onClick={handleDelete}>
              Delete account
            </Button>
          </>
        }
      >
        <Text className="text-body text-ink-2">
          <Inline className="text-ink font-medium">{deleting?.name}</Inline> ({deleting?.email}) loses access
          immediately and the account cannot be restored. Their onboarding history is kept. To take someone off the
          job temporarily, suspend them instead.
        </Text>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
