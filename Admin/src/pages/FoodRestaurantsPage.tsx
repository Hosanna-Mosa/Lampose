/* ══════════════════════════════════════════════════════════════════════════
   Food partner applications — the approval queue.

   A restaurant applies from the partner app and lands here as `pending`.
   Nothing is shown to a diner until somebody on this screen approves it, which
   is the only place in the whole console that flips `verificationStatus`.

   The table is the queue; the drawer is the decision. Approving from the row
   is deliberately NOT offered: the point of the drawer is that the documents,
   the payout account and the menu are read before the button is pressed, and a
   one-tap approve in a list is how that stops happening.

   Every figure on this screen is read from the response. Nothing is defaulted
   into existence — a missing value renders as a dash, because a zero would
   read as a real measurement somebody might act on.
   ══════════════════════════════════════════════════════════════════════════ */
import { Section } from '../components/common/molecules/Section';
import React, { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  MapPin,
  Phone,
  Play,
  RefreshCw,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import type { BadgeTone } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { Textarea } from '../components/common/atoms/Textarea';
import { DataRow } from '../components/common/molecules/DataRow';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { cx } from '../components/common/utils';
import { foodAdminService } from '../api/services/foodAdminService';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../lib/useFetch';
import type {
  FoodRestaurantDetail,
  FoodRestaurantRow,
  FoodVerificationStatus,
} from '../api/types';
import { Box } from '../components/common/atoms/Box';
import { Inline } from '../components/common/atoms/Inline';
import { Link } from '../components/common/atoms/Link';
import { List } from '../components/common/atoms/List';
import { ListItem } from '../components/common/atoms/ListItem';
import { PlainButton } from '../components/common/atoms/PlainButton';
import { TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Text } from '../components/common/atoms/Text';

interface FoodRestaurantsPageProps {
  search: string;
}

type StatusFilter = FoodVerificationStatus | 'all';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'pending', label: 'Awaiting review' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

const STATUS_TONE: Record<FoodVerificationStatus, BadgeTone> = {
  pending: 'warn',
  approved: 'good',
  rejected: 'crit',
};

const STATUS_LABEL: Record<FoodVerificationStatus, string> = {
  pending: 'Awaiting review',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** Roles the backend lets decide. Mirrored here only to hide a button that
 *  would 403 — `foodAdmin.routes.js` is the real guard. */
const DECIDING_ROLES = new Set(['Super Admin', 'Admin', 'Food Admin']);

const dash = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
};

const money = (value: number | undefined | null): string =>
  typeof value === 'number' && Number.isFinite(value) ? `₹${value.toLocaleString('en-IN')}` : '—';

const when = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const FoodRestaurantsPage: React.FC<FoodRestaurantsPageProps> = ({ search }) => {
  const { user } = useAuth();
  const canDecide = DECIDING_ROLES.has(user?.role ?? '');

  const [status, setStatus] = useState<StatusFilter>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const queue = useFetch(
    () => foodAdminService.getRestaurants({ status, search: search || undefined }),
    [status, search]
  );

  const detail = useFetch<FoodRestaurantDetail | null>(
    () =>
      openId
        ? foodAdminService.getRestaurant(openId)
        : Promise.resolve({
            data: null,
            status: 200,
            message: '',
            success: true,
            timestamp: '',
          }),
    [openId]
  );

  const rows = queue.data ?? [];
  const counts = (queue as { counts?: { pending: number; approved: number; rejected: number } }).counts;

  const open = detail.data;

  const closeDrawer = () => {
    setOpenId(null);
    setNote('');
  };

  const decide = async (decision: FoodVerificationStatus) => {
    if (!openId) return;
    if (decision === 'rejected' && !note.trim()) {
      setToast({ tone: 'crit', message: 'A rejection needs a reason — the partner is shown it in their app.' });
      return;
    }

    setBusy(true);
    const res = await foodAdminService.decide(openId, decision, note.trim() || undefined);
    setBusy(false);

    if (!res.success) {
      setToast({ tone: 'crit', message: res.message || 'That did not save.' });
      return;
    }

    setToast({ tone: 'good', message: res.message || `Application ${decision}.` });
    closeDrawer();
    queue.reload();
  };

  const togglePaused = async (row: FoodRestaurantRow) => {
    setBusy(true);
    const res = await foodAdminService.setActive(row.restaurantId, !row.isActive);
    setBusy(false);
    if (!res.success) {
      setToast({ tone: 'crit', message: res.message || 'That did not save.' });
      return;
    }
    setToast({ tone: 'good', message: `${row.restaurantName} ${row.isActive ? 'paused' : 'resumed'}.` });
    queue.reload();
  };

  const summary = useMemo(
    () =>
      counts
        ? [
            { label: 'Awaiting review', value: counts.pending, tone: 'warn' as BadgeTone },
            { label: 'Approved', value: counts.approved, tone: 'good' as BadgeTone },
            { label: 'Rejected', value: counts.rejected, tone: 'crit' as BadgeTone },
          ]
        : [],
    [counts]
  );

  return (
    <Box className="space-y-4">
      <PageHeader
        title="Restaurant applications"
        description="Applications from the Food Partner app. Approving one is what lists it to diners."
        actions={
          <Button variant="ghost" icon={RefreshCw} onClick={queue.reload} disabled={queue.refreshing}>
            Refresh
          </Button>
        }
      />

      {summary.length > 0 && (
        <Box className="grid grid-cols-3 gap-3">
          {summary.map((s) => (
            <Card key={s.label} padded>
              <Text className="text-micro uppercase text-ink-3">{s.label}</Text>
              <Text className="text-2xl font-semibold text-ink tabular mt-1">{s.value}</Text>
            </Card>
          ))}
        </Box>
      )}

      <Box className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <PlainButton
            key={f.id}
            onClick={() => setStatus(f.id)}
            className={cx(
              'h-8 px-3 rounded-control text-body transition-colors',
              status === f.id
                ? 'bg-brand-soft text-brand-ink font-medium'
                : 'text-ink-2 hover:bg-surface-inset'
            )}
          >
            {f.label}
          </PlainButton>
        ))}
      </Box>

      <Card>
        {queue.loading ? (
          <TableSkeleton cols={6} />
        ) : queue.error ? (
          <ErrorState message={queue.error} onRetry={queue.reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title="Nothing here"
            description={
              status === 'pending'
                ? 'No restaurant is waiting for a decision.'
                : 'No application matches this filter.'
            }
          />
        ) : (
          <Table>
            <TableHead>
              <Tr>
                <Th>Restaurant</Th>
                <Th>Owner</Th>
                <Th>Where</Th>
                <Th className="text-right">Menu</Th>
                <Th>Status</Th>
                <Th>Applied</Th>
                <Th />
              </Tr>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <Tr key={row.restaurantId}>
                  <Td>
                    <Text className="font-medium text-ink">{row.restaurantName}</Text>
                    <Text className="text-label text-ink-3">
                      {row.cuisineTypes.length ? row.cuisineTypes.join(' · ') : dash(row.description)}
                    </Text>
                  </Td>
                  <Td>
                    <Text className="text-ink-2">{dash(row.ownerName)}</Text>
                    <Text className="text-label text-ink-3">{dash(row.ownerEmail)}</Text>
                  </Td>
                  <Td>
                    <Text className="text-ink-2">{dash(row.address?.city)}</Text>
                    <Text className="text-label text-ink-3">{dash(row.address?.pincode)}</Text>
                  </Td>
                  <Td className="text-right tabular">{row.menuItemCount}</Td>
                  <Td>
                    <Box className="flex items-center gap-1.5">
                      <Badge tone={STATUS_TONE[row.verificationStatus]}>
                        {STATUS_LABEL[row.verificationStatus]}
                      </Badge>
                      {row.verificationStatus === 'approved' && !row.isActive && (
                        <Badge tone="neutral">Paused</Badge>
                      )}
                    </Box>
                  </Td>
                  <Td className="text-label text-ink-3">{when(row.createdAt)}</Td>
                  <Td className="text-right">
                    <Box className="flex items-center justify-end gap-1.5">
                      {canDecide && row.verificationStatus === 'approved' && (
                        <Button
                          variant="ghost"
                          icon={row.isActive ? Ban : Play}
                          onClick={() => togglePaused(row)}
                          disabled={busy}
                        >
                          {row.isActive ? 'Pause' : 'Resume'}
                        </Button>
                      )}
                      <Button variant="ghost" icon={ChevronRight} onClick={() => setOpenId(row.restaurantId)}>
                        Review
                      </Button>
                    </Box>
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* ── The decision ─────────────────────────────────────────────────── */}
      <Modal
        open={!!openId}
        onClose={closeDrawer}
        title={open?.restaurant.restaurantName || 'Application'}
        size="lg"
        footer={
          /* Pinned rather than sitting at the end of the body: an application
             is a long scroll, and a decision an approver has to hunt for is a
             decision made from the top of the page. */
          canDecide && open ? (
            <Box className="flex flex-wrap items-center justify-end gap-2 w-full">
              {open.restaurant.verificationStatus !== 'pending' && (
                <Button
                  variant="ghost"
                  icon={Clock}
                  onClick={() => decide('pending')}
                  disabled={busy}
                >
                  Back to the queue
                </Button>
              )}
              <Button
                variant="danger"
                icon={XCircle}
                onClick={() => decide('rejected')}
                disabled={busy || open.restaurant.verificationStatus === 'rejected'}
              >
                Reject
              </Button>
              <Button
                icon={CheckCircle2}
                onClick={() => decide('approved')}
                disabled={busy || open.restaurant.verificationStatus === 'approved'}
              >
                Approve and list
              </Button>
            </Box>
          ) : undefined
        }
      >
        {detail.loading ? (
          <Text className="text-body text-ink-3">Loading the application…</Text>
        ) : detail.error ? (
          <ErrorState message={detail.error} onRetry={detail.reload} />
        ) : !open ? (
          <Text className="text-body text-ink-3">Nothing to show.</Text>
        ) : (
          <Box className="space-y-5">
            <Box className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[open.restaurant.verificationStatus]}>
                {STATUS_LABEL[open.restaurant.verificationStatus]}
              </Badge>
              <Inline className="text-label text-ink-3 tabular">{open.restaurant.restaurantId}</Inline>
              {open.restaurant.verifiedAt && (
                <Inline className="text-label text-ink-3">decided {when(open.restaurant.verifiedAt)}</Inline>
              )}
            </Box>

            {!!open.restaurant.verificationNote && (
              <Box className="rounded-control bg-surface-inset p-3">
                <Text className="text-micro uppercase text-ink-3 mb-1">Note on file</Text>
                <Text className="text-body text-ink-2">{open.restaurant.verificationNote}</Text>
              </Box>
            )}

            <Section title="The business">
              <DataRow label="Tagline" value={dash(open.restaurant.description)} />
              <DataRow
                label="Cuisines"
                value={open.restaurant.cuisineTypes.length ? open.restaurant.cuisineTypes.join(', ') : '—'}
              />
              <DataRow label="Owner" value={dash(open.restaurant.ownerName)} />
              <DataRow label="Email" value={dash(open.restaurant.ownerEmail)} mono />
              <DataRow label="Owner phone" value={dash(open.restaurant.ownerPhone)} mono />
              <DataRow label="Customer number" value={dash(open.restaurant.contactNumber)} mono />
            </Section>

            <Section title="Where it is">
              <DataRow
                label="Address"
                value={[
                  open.restaurant.address?.line1,
                  open.restaurant.address?.line2,
                  open.restaurant.address?.city,
                  open.restaurant.address?.state,
                  open.restaurant.address?.pincode,
                ]
                  .filter(Boolean)
                  .join(', ') || '—'}
              />
              <DataRow label="Landmark" value={dash(open.restaurant.address?.landmark)} />
              <DataRow
                label="Pin"
                value={
                  open.restaurant.location?.coordinates?.length === 2 ? (
                    <Link
                      className="text-brand-ink inline-flex items-center gap-1 hover:underline"
                      href={`https://www.google.com/maps?q=${open.restaurant.location.coordinates[1]},${open.restaurant.location.coordinates[0]}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin className="size-3.5" />
                      {open.restaurant.location.coordinates[1]}, {open.restaurant.location.coordinates[0]}
                      <ExternalLink className="size-3" />
                    </Link>
                  ) : (
                    '—'
                  )
                }
              />
            </Section>

            <Section title="Operations">
              <DataRow label="Preparation time" value={`${dash(open.restaurant.avgPreparationTime)} min`} />
              <DataRow label="Delivery radius" value={`${dash(open.restaurant.deliveryRadiusKm)} km`} />
              <DataRow label="Minimum order" value={money(open.restaurant.minOrderValue)} />
              <DataRow label="Packaging" value={money(open.restaurant.packagingCharge)} />
              <DataRow
                label="Delivery fee"
                value={
                  open.restaurant.deliveryFee?.type === 'free_above'
                    ? `Free above ${money(open.restaurant.deliveryFee?.freeAboveValue)}`
                    : open.restaurant.deliveryFee?.type === 'distance_based'
                      ? `${money(open.restaurant.deliveryFee?.perKm)} per km`
                      : money(open.restaurant.deliveryFee?.amount)
                }
              />
              <DataRow
                label="Payments"
                value={
                  [
                    open.restaurant.acceptsOnlinePayment && 'Online',
                    open.restaurant.acceptsCod && 'Cash on delivery',
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'
                }
              />
              <DataRow
                label="Opening hours"
                value={
                  open.restaurant.openingHours?.length
                    ? `${open.restaurant.openingHours.length} slots across the week`
                    : '—'
                }
              />
            </Section>

            <Section title="Documents">
              <DataRow label="FSSAI" value={dash(open.restaurant.fssaiLicenseNumber)} mono />
              <DataRow
                label="FSSAI expiry"
                value={
                  open.restaurant.fssaiExpiry
                    ? new Date(open.restaurant.fssaiExpiry).toLocaleDateString('en-IN')
                    : '—'
                }
              />
              <DataRow
                label="GST"
                value={open.restaurant.gstExempt ? 'Exempt / composition scheme' : dash(open.restaurant.gstNumber)}
                mono
              />
              <DataRow label="PAN" value={dash(open.restaurant.panNumber)} mono />
              <DataRow
                label="Uploaded"
                value={
                  open.restaurant.verificationDocuments?.length
                    ? open.restaurant.verificationDocuments
                        .map((d) => d.kind)
                        .join(', ')
                    : 'None attached'
                }
              />
            </Section>

            <Section title="Payout">
              <DataRow label="Account holder" value={dash(open.restaurant.payout?.accountHolderName)} />
              <DataRow
                label="Account"
                value={dash(
                  open.restaurant.payout?.bankAccountNumber ||
                    (open.restaurant.payout?.accountLast4
                      ? `ending ${open.restaurant.payout.accountLast4}`
                      : '')
                )}
                mono
              />
              <DataRow label="IFSC" value={dash(open.restaurant.payout?.ifscCode)} mono />
              <DataRow label="Type" value={dash(open.restaurant.payout?.accountType)} />
              <DataRow label="UPI" value={dash(open.restaurant.payout?.upiId)} mono />
            </Section>

            <Section title={`Menu — ${open.menuItemCount} item${open.menuItemCount === 1 ? '' : 's'}`}>
              {open.menu.length === 0 ? (
                <Text className="text-body text-ink-3">No menu was submitted with this application.</Text>
              ) : (
                <Box className="space-y-3">
                  {open.menu.map((group) => (
                    <Box key={group.category}>
                      <Text className="text-micro uppercase text-ink-3 mb-1">
                        {group.category} · {group.items.length}
                      </Text>
                      <List className="space-y-1 list-none m-0 p-0">
                        {group.items.map((item) => (
                          <ListItem
                            key={item.productId}
                            className="flex items-center gap-2 py-1 border-b border-line last:border-0"
                          >
                            <Inline
                              className={cx(
                                'size-2.5 rounded-[2px] border shrink-0',
                                item.isVeg === 'veg' ? 'border-good' : 'border-crit'
                              )}
                            />
                            <Inline className="text-body text-ink flex-1 truncate">{item.productName}</Inline>
                            {!!item.tags?.length && (
                              <Inline className="text-label text-ink-3">{item.tags.join(' · ')}</Inline>
                            )}
                            <Inline className="text-body tabular text-ink-2">
                              {money(item.discountedPrice || item.price)}
                            </Inline>
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  ))}
                </Box>
              )}
            </Section>

            <Section title="Contract">
              <DataRow
                label="Accepted"
                value={open.restaurant.contract?.accepted ? 'Yes' : 'No'}
              />
              <DataRow label="Signed by" value={dash(open.restaurant.contract?.signature)} />
              <DataRow label="Signed at" value={when(open.restaurant.contract?.acceptedAt)} />
            </Section>

            {/* ── The decision itself ──────────────────────────────────── */}
            {canDecide ? (
              <Box className="border-t border-line pt-4">
                <Field
                  label="Note"
                  hint="Required to reject. The partner reads this in their app as what needs fixing."
                >
                  <Textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. The FSSAI licence photo is too blurred to read."
                  />
                </Field>
              </Box>
            ) : (
              <Box className="border-t border-line pt-4">
                <Text className="text-body text-ink-3 flex items-center gap-2">
                  <Phone className="size-4" />
                  Your role can read this queue but not decide on it.
                </Text>
              </Box>
            )}
          </Box>
        )}
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};

