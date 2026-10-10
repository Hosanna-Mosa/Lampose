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
  KeyRound,
  MapPin,
  Phone,
  Play,
  RefreshCw,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import { Option } from '../components/common/atoms/Option';
import { Select } from '../components/common/atoms/Select';
import type { BadgeTone } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { Textarea } from '../components/common/atoms/Textarea';
import { DataRow } from '../components/common/molecules/DataRow';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { FilterBar } from '../components/common/molecules/FilterBar';
import { FilterChips } from '../components/common/molecules/FilterChips';
import type { FilterChipOption } from '../components/common/molecules/FilterChips';
import { ResultCount } from '../components/common/molecules/ResultCount';
import { MenuFilterBar } from '../components/common/molecules/MenuFilterBar';
import { Pagination } from '../components/common/molecules/Pagination';
import { useMenuView } from '../lib/menuFilter';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { cx, filterSelectClass } from '../components/common/utils';
import { foodAdminService } from '../api/services/foodAdminService';
import type { FoodQueueFacetValue, FoodQueueFilters } from '../api/services/foodAdminService';
import { useHeaderSearch } from '../context/headerSearch';
import { useAuth } from '../context/AuthContext';
import { useDebounced, useFetch } from '../lib/useFetch';
import type {
  FoodProductRow,
  FoodRestaurantDetail,
  FoodRestaurantRow,
  FoodVerificationStatus,
} from '../api/types';
import { Box } from '../components/common/atoms/Box';
import { Inline } from '../components/common/atoms/Inline';
import { Link } from '../components/common/atoms/Link';
import { List } from '../components/common/atoms/List';
import { ListItem } from '../components/common/atoms/ListItem';
import { TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Text } from '../components/common/atoms/Text';

interface FoodRestaurantsPageProps {
  search: string;
}

type StatusFilter = FoodVerificationStatus | 'all';
/** Whether an approved kitchen is listed right now — `isActive`. */
type ListingFilter = 'all' | 'live' | 'paused';

const FILTERS: { id: StatusFilter; label: string; tone?: BadgeTone }[] = [
  { id: 'pending', label: 'Awaiting review', tone: 'warn' },
  { id: 'approved', label: 'Approved', tone: 'good' },
  { id: 'rejected', label: 'Rejected', tone: 'crit' },
  { id: 'all', label: 'All' },
];

const LISTING_FILTERS: { id: ListingFilter; label: string; tone?: BadgeTone }[] = [
  { id: 'all', label: 'Live or paused' },
  { id: 'live', label: 'Live', tone: 'good' },
  { id: 'paused', label: 'Paused', tone: 'neutral' },
];

/* ── The filters beyond status ───────────────────────────────────────────
   Every one is applied and counted by the server (`listRestaurants`), each
   count under the search and every OTHER filter, so "Pune (12)" is what
   picking Pune shows. '' means not chosen. */

type FilterKey = keyof FoodQueueFilters;

const EMPTY_FILTERS: Required<FoodQueueFilters> = {
  city: '',
  state: '',
  cuisine: '',
  applied: '',
  fssai: '',
  payout: '',
  pin: '',
  menu: '',
  dineIn: '',
};

/** The server's word for "left blank" in a hand-typed field. */
const NONE = '__none';

/** Fixed choices: [value, label], with '' as the "any" option. */
const FIXED_FILTERS: {
  key: Exclude<FilterKey, 'city' | 'state' | 'cuisine'>;
  label: string;
  options: [string, string][];
}[] = [
  {
    key: 'applied',
    label: 'Applied',
    options: [['', 'Applied any time'], ['1', 'Last 24 hours'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']],
  },
  {
    key: 'fssai',
    label: 'FSSAI licence',
    options: [['', 'Any FSSAI'], ['has', 'Licence given'], ['missing', 'No licence'], ['expired', 'Licence expired']],
  },
  {
    key: 'payout',
    label: 'Payout account',
    options: [['', 'Any payout'], ['has', 'Payout account added'], ['missing', 'No payout account']],
  },
  {
    key: 'pin',
    label: 'Map pin',
    options: [['', 'Any map pin'], ['pinned', 'Pinned on map'], ['unpinned', 'No map pin']],
  },
  {
    key: 'menu',
    label: 'Menu',
    options: [['', 'Any menu'], ['has', 'Has dishes'], ['none', 'No dishes yet']],
  },
  {
    key: 'dineIn',
    label: 'Dine-in',
    options: [['', 'Delivery & dine-in'], ['on', 'Takes table bookings'], ['off', 'Delivery only']],
  },
];

const withCount = (label: string, n: number | undefined) => (n === undefined ? label : `${label} (${n})`);

/**
 * A hand-typed field's choices ("Pune (12)"), from the server's facet. The
 * chosen value is kept even when a search has left it with no rows, so the
 * select never silently shows a different choice from the one applied.
 */
const placeOptions = (facet: FoodQueueFacetValue[] | undefined, chosen: string, blankLabel: string) => {
  const list = (facet ?? []).map((f) => ({
    value: f.value,
    label: withCount(f.value === NONE ? blankLabel : f.label || f.value, f.n),
  }));
  if (chosen && !list.some((o) => o.value === chosen)) {
    list.push({ value: chosen, label: withCount(chosen === NONE ? blankLabel : chosen, 0) });
  }
  return list;
};

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

/*
 * Where an FSSAI licence is actually verified.
 *
 * FoSCoS asks for four things at once — company name, licence number, state
 * and district — which is why the Onboard form now collects the last two on
 * its FSSAI step and why the review drawer prints all four together. Without
 * the district a verifier can open this portal and still not run the check.
 */
const FSSAI_PORTAL_URL = 'https://foscos.fssai.gov.in/';

/**
 * The submitted menu inside the drawer: search, the shared filter row and
 * pages of 10, so a 200-dish application does not become one endless list.
 * Its own component so the filters and the page reset with each restaurant.
 */
function DrawerMenu({ menu }: { menu: { category: string; items: FoodProductRow[] }[] }) {
  const dishes = useMemo(
    () => menu.flatMap((group) => group.items.map((item) => ({ ...item, category: item.category || group.category }))),
    [menu]
  );
  const view = useMenuView(dishes, '', 10);

  const groups = useMemo(() => {
    const map = new Map<string, FoodProductRow[]>();
    view.pageItems.forEach((item) => {
      const key = item.category || 'Uncategorised';
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    });
    return [...map.entries()];
  }, [view.pageItems]);

  if (dishes.length === 0) {
    return <Text className="text-body text-ink-3">No menu was submitted with this application.</Text>;
  }

  return (
    <Box className="space-y-3">
      <MenuFilterBar
        filters={view.filters}
        onChange={view.setFilters}
        onReset={view.resetFilters}
        categories={view.categories}
        withSearch
      />
      {groups.length === 0 ? (
        <Text className="text-body text-ink-3">No dishes match these filters.</Text>
      ) : (
        groups.map(([category, items]) => (
          <Box key={category}>
            <Text className="text-micro uppercase text-ink-3 mb-1">
              {category} · {items.length}
            </Text>
            <List className="space-y-1 list-none m-0 p-0">
              {items.map((item) => (
                <ListItem
                  key={item.productId}
                  className="flex items-center gap-2 py-1 border-b border-line last:border-0"
                >
                  <Inline
                    className={cx(
                      'size-2.5 rounded-[2px] border shrink-0',
                      item.isVeg === 'veg' ? 'border-good' : item.isVeg === 'egg' ? 'border-warn' : 'border-crit'
                    )}
                  />
                  <Inline className="text-body text-ink flex-1 truncate">{item.productName}</Inline>
                  {!item.isAvailable && <Inline className="text-label text-warn">Sold out</Inline>}
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
        ))
      )}
      <Pagination
        page={view.page}
        pageCount={view.pageCount}
        pageSize={view.pageSize}
        total={view.filtered.length}
        onPage={view.setPage}
        onPageSize={view.setPageSize}
        pageSizes={[10, 20, 50]}
        noun={view.filtered.length === 1 ? 'dish' : 'dishes'}
      />
    </Box>
  );
}

export const FoodRestaurantsPage: React.FC<FoodRestaurantsPageProps> = ({ search }) => {
  const { user } = useAuth();
  const canDecide = DECIDING_ROLES.has(user?.role ?? '');

  const [status, setStatus] = useState<StatusFilter>('pending');
  const [listing, setListing] = useState<ListingFilter>('all');
  const [filters, setFilters] = useState<Required<FoodQueueFilters>>(EMPTY_FILTERS);
  const setFilter = (key: FilterKey, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));
  /* The box beside the filters types into the header's search — one value,
     two places to reach it. */
  const headerSearch = useHeaderSearch();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  /* The sign-in link, when the message carrying it did not go — see
     `handoff` below. Null on the ordinary path, which is most of them. */
  const [handoff, setHandoff] = useState<{ name: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  /* The header's box, debounced: each value is a request to the server. */
  const q = useDebounced(search.trim(), 300);

  /* `useFetch` keeps only `data`, so the two tallies ride inside it. */
  const queue = useFetch(async () => {
    const res = await foodAdminService.getRestaurants({
      status,
      search: q || undefined,
      listing: status === 'approved' ? listing : undefined,
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    });
    return {
      ...res,
      data: { rows: res.data ?? [], counts: res.counts, matchCounts: res.matchCounts, facets: res.facets },
    };
  }, [status, listing, q, filters]);

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

  const rows = queue.data?.rows ?? [];
  /* The whole queue, for the summary cards. */
  const counts = queue.data?.counts;
  /* Under the search and the other filter — the numbers on the chips. */
  const matched = queue.data?.matchCounts;
  /* Every other filter's numbers, under the same rule. */
  const facets = queue.data?.facets;

  const pickStatus = (next: StatusFilter) => {
    setStatus(next);
    /* Live/paused only exists for approved kitchens; leaving it set on
       another tab would narrow a list with no visible reason. */
    if (next !== 'approved') setListing('all');
  };

  const statusChips: FilterChipOption<StatusFilter>[] = FILTERS.map((f) => ({
    ...f,
    count: matched
      ? f.id === 'all'
        ? matched.pending + matched.approved + matched.rejected
        : matched[f.id]
      : undefined,
  }));

  const listingChips: FilterChipOption<ListingFilter>[] = LISTING_FILTERS.map((f) => ({
    ...f,
    count: matched ? (f.id === 'all' ? matched.live + matched.paused : matched[f.id]) : undefined,
  }));

  /* What the list holds, counted by the server rather than from `rows` — the
     list is capped at a hundred and the count is not. */
  const shown = matched
    ? status === 'all'
      ? matched.pending + matched.approved + matched.rejected
      : matched[status]
    : rows.length;
  const total = counts ? counts.pending + counts.approved + counts.rejected : rows.length;
  const moreFilters = Object.values(filters).some(Boolean);
  const filtered = Boolean(q) || status !== 'pending' || listing !== 'all' || moreFilters;
  const clearFilters = () => {
    setStatus('all');
    setListing('all');
    setFilters(EMPTY_FILTERS);
  };

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

    /* The approval stands whatever WhatsApp did, and when it did nothing the
       link comes back so a person can carry it the rest of the way. */
    const credentials = res.data?.credentials;
    if (credentials?.setupUrl && open) {
      setHandoff({ name: open.restaurant.restaurantName, url: credentials.setupUrl });
      setCopied(false);
    }

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

  /*
   * The owner's sign-in details, again.
   *
   * Confirmed first, because it REPLACES the password: an owner who did get
   * the first message and has signed in would be locked out by a press meant
   * to help them. The confirm names that consequence rather than asking "are
   * you sure".
   */
  const resendCredentials = async (restaurantId: string, name: string) => {
    const ok = window.confirm(
      `Send ${name} a new sign-in link?\n\n`
        + 'Any link sent earlier stops working. If they have already set a password, '
        + 'that password is not affected.'
    );
    if (!ok) return;

    setBusy(true);
    const res = await foodAdminService.resendCredentials(restaurantId);
    setBusy(false);

    setToast(
      res.success
        ? { tone: 'good', message: res.message || 'New sign-in details sent.' }
        : { tone: 'crit', message: res.message || 'Those details could not be sent.' }
    );

    const credentials = res.data?.credentials;
    if (credentials?.setupUrl) {
      setHandoff({ name, url: credentials.setupUrl });
      setCopied(false);
    }
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
          <>
            {/* FoSCoS is where an FSSAI licence is actually checked, and the
                review drawer prints the four values that check needs. The link
                is here so verifying one does not start with finding the portal
                again — `noopener` because this opens a government site in a
                tab that would otherwise keep a handle on the console. */}
            <Button
              variant="ghost"
              icon={ExternalLink}
              onClick={() => window.open(FSSAI_PORTAL_URL, '_blank', 'noopener,noreferrer')}
            >
              FSSAI portal
            </Button>
            <Button variant="ghost" icon={RefreshCw} onClick={queue.reload} disabled={queue.refreshing}>
              Refresh
            </Button>
          </>
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

      <FilterBar
        summary={
          <ResultCount
            shown={shown}
            total={total}
            noun="restaurants"
            filtered={shown !== total}
            onClear={status !== 'all' || listing !== 'all' || moreFilters ? clearFilters : undefined}
          />
        }
        search={{
          value: search,
          onChange: headerSearch.set,
          placeholder: 'Search name, owner, phone, area, pincode or FSSAI',
        }}
      >
        <FilterChips label="Status" options={statusChips} value={status} onChange={pickStatus} />
        {status === 'approved' && (
          <FilterChips label="Listing" options={listingChips} value={listing} onChange={setListing} />
        )}
      </FilterBar>

      {/* Where it is, what it cooks, and how ready it is to go live. Each
          option's number is what choosing it would leave in the list. */}
      <Box className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="City"
          className={filterSelectClass}
          value={filters.city}
          onChange={(e) => setFilter('city', e.target.value)}
        >
          <Option value="">All cities</Option>
          {placeOptions(facets?.city, filters.city, 'City not given').map((o) => (
            <Option key={o.value} value={o.value}>{o.label}</Option>
          ))}
        </Select>
        <Select
          aria-label="State"
          className={filterSelectClass}
          value={filters.state}
          onChange={(e) => setFilter('state', e.target.value)}
        >
          <Option value="">All states</Option>
          {placeOptions(facets?.state, filters.state, 'State not given').map((o) => (
            <Option key={o.value} value={o.value}>{o.label}</Option>
          ))}
        </Select>
        <Select
          aria-label="Cuisine"
          className={filterSelectClass}
          value={filters.cuisine}
          onChange={(e) => setFilter('cuisine', e.target.value)}
        >
          <Option value="">All cuisines</Option>
          {placeOptions(facets?.cuisine, filters.cuisine, 'No cuisine given').map((o) => (
            <Option key={o.value} value={o.value}>{o.label}</Option>
          ))}
        </Select>
        {FIXED_FILTERS.map((f) => {
          const counts = facets?.[f.key] as Record<string, number> | undefined;
          return (
            <Select
              key={f.key}
              aria-label={f.label}
              className={filterSelectClass}
              value={filters[f.key]}
              onChange={(e) => setFilter(f.key, e.target.value)}
            >
              {f.options.map(([value, label]) => (
                <Option key={value} value={value}>
                  {value ? withCount(label, counts ? counts[value] ?? 0 : undefined) : label}
                </Option>
              ))}
            </Select>
          );
        })}
      </Box>

      <Card>
        {queue.loading ? (
          <TableSkeleton cols={6} />
        ) : queue.error ? (
          <ErrorState message={queue.error} onRetry={queue.reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title={filtered ? 'No restaurants match these filters' : 'Nothing here'}
            description={
              q
                ? 'Nothing matches that search — clear it to see the rest.'
                : status === 'pending'
                  ? 'No restaurant is waiting for a decision.'
                  : 'No application matches this filter.'
            }
            action={
              status !== 'all' || listing !== 'all' || moreFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
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
              {open.restaurant.verificationStatus === 'approved' && (
                <Button
                  variant="ghost"
                  icon={KeyRound}
                  onClick={() => resendCredentials(open.restaurant.restaurantId, open.restaurant.restaurantName)}
                  disabled={busy}
                >
                  Resend sign-in details
                </Button>
              )}
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
              {/* ── What FoSCoS asks for, in the order it asks ─────────────

                  Printed as a set rather than scattered through the drawer,
                  because verifying a licence means typing these four into one
                  form: the name, the number, the state and the district. The
                  state and district are read off the CERTIFICATE on the
                  onboarding form, not off the address, so they can legitimately
                  differ from where the kitchen stands. */}
              <DataRow
                label="Licence holder"
                value={dash(open.restaurant.fssaiCompanyName || open.restaurant.restaurantName)}
              />
              <DataRow label="FSSAI" value={dash(open.restaurant.fssaiLicenseNumber)} mono />
              <DataRow label="Licence state" value={dash(open.restaurant.address?.state)} />
              <DataRow label="Licence district" value={dash(open.restaurant.address?.district)} />
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
              <Box className="pt-2">
                <Button
                  variant="ghost"
                  icon={ExternalLink}
                  onClick={() => window.open(FSSAI_PORTAL_URL, '_blank', 'noopener,noreferrer')}
                >
                  Check this licence on FoSCoS
                </Button>
              </Box>
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
              <DrawerMenu menu={open.menu} />
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

      {/*
        The hand-off.

        It appears only when the WhatsApp did not go, which today is every
        time — there is no approved template yet. An approved owner who was
        sent nothing cannot sign in and nobody can help them: the link is a
        SHA-256 by then and the stored password is one nobody has ever seen.
        So the person who just approved them is given the link to pass on by
        whatever reaches the owner.

        It stops appearing on its own the day the template is approved.
      */}
      <Modal
        open={!!handoff}
        onClose={() => setHandoff(null)}
        title="Send this link to the owner"
        description={
          handoff
            ? `The WhatsApp to ${handoff.name} did not go. This link lets them set their password — it works once and expires in 48 hours.`
            : undefined
        }
        size="md"
        footer={
          <Box className="flex justify-end gap-2 w-full">
            <Button variant="ghost" onClick={() => setHandoff(null)}>Done</Button>
          </Box>
        }
      >
        {handoff ? (
          <Box className="space-y-3">
            <Box className="rounded-control border border-line bg-canvas p-3">
              <Text className="text-label text-ink break-all">{handoff.url}</Text>
            </Box>
            <Button
              variant="ghost"
              icon={KeyRound}
              onClick={() => {
                /* `writeText` is refused outside a secure context and in some
                   in-app browsers, so the link stays on screen to be read or
                   selected by hand either way. */
                navigator.clipboard?.writeText(handoff.url).then(
                  () => setCopied(true),
                  () => setCopied(false)
                );
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Text className="text-label text-ink-3">
              Anyone holding this link can set the password for {handoff.name}. Send it to the
              owner's own number and to nobody else.
            </Text>
          </Box>
        ) : null}
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};

