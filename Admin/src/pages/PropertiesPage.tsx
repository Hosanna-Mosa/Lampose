import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Calendar,
  Hourglass,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { IconButton } from '../components/common/atoms/IconButton';
import { Input } from '../components/common/atoms/Input';
import { Select } from '../components/common/atoms/Select';
import { Skeleton } from '../components/common/atoms/Skeleton';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { DataRow } from '../components/common/molecules/DataRow';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { cx, filterBySearch } from '../components/common/utils';
import { propertyService } from '../api/services/propertyService';
import { useFetch } from '../lib/useFetch';
import { PROPERTY_CATEGORIES, propertyCategoryLabel, STAY_TYPES } from '../lib/domain';
import { formatDate, formatDateTime, rupees } from '../lib/format';
import type { PropertyEntity } from '../api/types';

import { Thumb } from '../components/properties/atoms/Thumb';
import { KeyValueEditor } from '../components/properties/organisms/KeyValueEditor';
import { BedAvailability } from '../components/properties/organisms/BedAvailability';
import type { KVRow } from '../components/properties/organisms/KeyValueEditor';
import { Aside } from '../components/common/atoms/Aside';
import { Box } from '../components/common/atoms/Box';
import { Form } from '../components/common/atoms/Form';
import { Heading } from '../components/common/atoms/Heading';
import { Image } from '../components/common/atoms/Image';
import { Inline } from '../components/common/atoms/Inline';
import { Link } from '../components/common/atoms/Link';
import { Option } from '../components/common/atoms/Option';
import { PlainButton } from '../components/common/atoms/PlainButton';
import { PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { PlainTextarea } from '../components/common/atoms/PlainTextarea';
import { Region } from '../components/common/atoms/Region';
import { Text } from '../components/common/atoms/Text';
interface PropertiesPageProps {
  search: string;
}

const EMPTY_FORM = {
  name: '',
  place: '',
  address: '',
  category: 'PG_HOSTEL',
  ownerName: '',
  ownerMobile: '',
  rent: '',
  deposit: '',
  stayType: 'Long Stay',
};


const KNOWN_DETAIL_KEYS = new Set([
  'sharingTypes', 'roomTypes', 'bedType', 'roomType', 'sharingPrices',
  'foodIncluded', 'foodType', 'curfewTime', 'hostelType', 'rateType',
]);

const humanizeKey = (key: string): string =>
  key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/**
 * Who a layout is let to, as one phrase.
 *
 * `allowedTenantsByLayout` holds a LIST per layout — a flat offered to
 * families and to single women is one flat with two kinds of tenant — while
 * every row onboarded before the control became multi-select holds a bare
 * string. Both are read; nothing was migrated.
 *
 * This is also why it is a function rather than `tenants[l]?.replace(...)`,
 * which is what it was: `String.prototype.replace` on an array is a
 * TypeError, so the first multi-value listing would have taken the whole
 * drawer down.
 */
const tenantNote = (value: unknown): string | null => {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const words = list
    .map((t) => String(t).replace(/^Bachelors /, '').trim())
    .filter(Boolean);
  return words.length ? words.join(' / ') : null;
};

interface DetailRow {
  key: string;
  label: string;
  value: React.ReactNode;
}

/** Read-only, category-aware rendering of `categoryDetails` for the detail drawer. */
const describeCategoryDetails = (details: Record<string, unknown>): DetailRow[] => {
  const rows: DetailRow[] = [];

  const sharingList = details.sharingTypes ?? details.roomTypes;
  if (Array.isArray(sharingList) && sharingList.length) {
    rows.push({
      key: details.sharingTypes ? 'sharingTypes' : 'roomTypes',
      label: details.sharingTypes ? 'Sharing types' : 'Room types',
      value: sharingList.join(', '),
    });
  }
  if (typeof details.bedType === 'string' && details.bedType) {
    rows.push({ key: 'bedType', label: 'Bed type', value: details.bedType });
  }
  if (Array.isArray(details.bedTypes) && details.bedTypes.length) {
    rows.push({ key: 'bedTypes', label: 'Bed types', value: details.bedTypes.join(' · ') });
  }
  if (Array.isArray(details.furnishingItems) && details.furnishingItems.length) {
    rows.push({
      key: 'furnishingItems',
      label: 'Key amenities included',
      value: details.furnishingItems.join(' · '),
    });
  }
  if (Array.isArray(details.roomTypes) && details.roomTypes.length) {
    /* Each layout with its own furnishing, because they differ — a house lets
       a semi-furnished 1 BHK and a fully-furnished 2 BHK. */
    const byLayout = (details.furnishingByLayout ?? {}) as Record<string, string>;
    const counts = (details.sharingRooms ?? {}) as Record<string, number>;
    const tenants = (details.allowedTenantsByLayout ?? {}) as Record<string, string | string[]>;
    const kitchens = (details.kitchenByLayout ?? {}) as Record<string, boolean>;
    rows.push({
      key: 'roomTypes',
      label: 'Layouts',
      value: (details.roomTypes as string[])
        .map((l) => {
          const bits = [l];
          if (counts[l]) bits.push(`×${counts[l]}`);
          const notes = [
            byLayout[l],
            tenantNote(tenants[l]),
            kitchens[l] === false ? 'no kitchen' : null,
          ].filter(Boolean);
          if (notes.length) bits.push(`(${notes.join(', ')})`);
          return bits.join(' ');
        })
        .join(' · '),
    });
  } else if (typeof details.roomType === 'string' && details.roomType) {
    rows.push({ key: 'roomType', label: 'Room type', value: details.roomType });
  }

  const prices = details.sharingPrices;
  if (prices && typeof prices === 'object' && !Array.isArray(prices) && Object.keys(prices).length) {
    rows.push({
      key: 'sharingPrices',
      label: 'Pricing by option',
      value: (
        <Box className="space-y-1">
          {Object.entries(prices as Record<string, unknown>).map(([label, price]) => (
            <Box key={label} className="flex items-center justify-between gap-3">
              <Inline className="text-ink">{label}</Inline>
              <Inline className="tabular">{rupees(Number(price) || 0)}</Inline>
            </Box>
          ))}
        </Box>
      ),
    });
  }

  if (details.foodIncluded !== undefined && details.foodIncluded !== null) {
    rows.push({ key: 'foodIncluded', label: 'Food included', value: details.foodIncluded ? 'Yes' : 'No' });
  }
  if (typeof details.foodType === 'string' && details.foodType) {
    rows.push({ key: 'foodType', label: 'Food type', value: details.foodType });
  }
  if (typeof details.curfewTime === 'string' && details.curfewTime) {
    rows.push({ key: 'curfewTime', label: 'Curfew', value: details.curfewTime });
  }
  if (typeof details.hostelType === 'string' && details.hostelType) {
    rows.push({ key: 'hostelType', label: 'Gender / hostel type', value: details.hostelType });
  }
  if (typeof details.rateType === 'string' && details.rateType) {
    rows.push({ key: 'rateType', label: 'Rate type', value: details.rateType });
  }

  for (const [key, value] of Object.entries(details)) {
    if (KNOWN_DETAIL_KEYS.has(key) || value === undefined || value === null || value === '') continue;
    rows.push({
      key,
      label: humanizeKey(key),
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    });
  }

  return rows;
};


/** `categoryDetails` (or any plain object) → editable rows. Non-string values
 *  are shown as their JSON so an editor round-trips numbers/arrays/objects
 *  unchanged when nothing about that row is touched. */
const objectToRows = (obj: Record<string, unknown>): KVRow[] =>
  Object.entries(obj || {}).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));

/** The inverse of objectToRows: each value is parsed as JSON when it is
 *  valid JSON (so "8000" becomes 8000, "true" becomes true, and
 *  '["Single","2 Sharing"]' becomes an array) and kept as plain text
 *  otherwise. Blank keys are dropped. */
const rowsToObject = (rows: KVRow[]): Record<string, unknown> => {
  const obj: Record<string, unknown> = {};
  for (const { key, value } of rows) {
    const k = key.trim();
    if (!k) continue;
    if (value.trim() === '') {
      obj[k] = '';
      continue;
    }
    try {
      obj[k] = JSON.parse(value);
    } catch {
      obj[k] = value;
    }
  }
  return obj;
};


export const PropertiesPage: React.FC<PropertiesPageProps> = ({ search }) => {
  const [category, setCategory] = useState('All');
  const [stayType, setStayType] = useState('All');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [selected, setSelected] = useState<PropertyEntity | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PropertyEntity | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resending, setResending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<PropertyEntity | null>(null);
  const [editForm, setEditForm] = useState<typeof EMPTY_FORM & { description: string } | null>(null);
  const [editDetailRows, setEditDetailRows] = useState<KVRow[]>([]);

  const { data, loading, error, refreshing, reload } = useFetch(
    () =>
      propertyService.getProperties({
        ...(category !== 'All' && { category }),
        ...(stayType !== 'All' && { stayType }),
      }),
    [category, stayType]
  );

  /* Sorting by card clicks: off → most clicked first → least clicked first.
     Pending listings (no count yet) always sort last. */
  const [clickSort, setClickSort] = useState<'none' | 'desc' | 'asc'>('none');
  const cycleClickSort = () =>
    setClickSort((s) => (s === 'none' ? 'desc' : s === 'desc' ? 'asc' : 'none'));

  // The header filter narrows what is already loaded, so typing costs no request.
  const properties = useMemo(() => {
    const matched = filterBySearch(data ?? [], search, (p, q) =>
      [p.name, p.place, p.ownerName, p.ownerMobile, p.address, p.employeeEmail]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q))
    );
    if (clickSort === 'none') return matched;
    const dir = clickSort === 'desc' ? -1 : 1;
    return [...matched].sort((a, b) => {
      if (a.clickCount === null && b.clickCount === null) return 0;
      if (a.clickCount === null) return 1;
      if (b.clickCount === null) return -1;
      return (a.clickCount - b.clickCount) * dir;
    });
  }, [data, search, clickSort]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const res = await propertyService.createProperty({
      name: form.name.trim(),
      place: form.place.trim(),
      address: form.address.trim(),
      category: form.category,
      ownerName: form.ownerName.trim(),
      ownerMobile: form.ownerMobile.trim(),
      rent: Number(form.rent) || 0,
      deposit: Number(form.deposit) || 0,
      stayType: form.stayType,
    });

    setSaving(false);

    if (res.success) {
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setToast({ tone: 'good', message: `“${res.data?.name}” added to the properties collection.` });
      reload();
    } else {
      setFormError(res.message || 'Could not create the property.');
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await propertyService.deleteProperty(pendingDelete.id);
    setDeleting(false);

    if (res.success) {
      setToast({
        tone: 'good',
        message: pendingDelete.isVerified
          ? `“${pendingDelete.name}” deleted.`
          : `Onboarding request for “${pendingDelete.name}” cancelled.`,
      });
      if (selected?.id === pendingDelete.id) setSelected(null);
      setPendingDelete(null);
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Delete failed.' });
      setPendingDelete(null);
    }
  };

  /**
   * Ask the owner again.
   *
   * No confirmation dialog, unlike Delete: this is not destructive, and the
   * server refuses a second send within a minute, so the double tap a dialog
   * would be guarding against cannot put two messages on an owner's phone.
   * The refusals worth reading — a wrong number, WhatsApp down, the cooldown —
   * come back as sentences and are shown as they are.
   *
   * `reload()` afterwards because a request that had failed to send now reads
   * as sent, and the grid should not still be showing the old state.
   */
  const handleResend = async (property: PropertyEntity) => {
    setResending(true);
    const res = await propertyService.resendVerification(property.id);
    setResending(false);

    if (res.success) {
      const attempts = res.data?.attempts;
      setToast({
        tone: 'good',
        message: `Approval message sent to ${property.ownerName || 'the owner'} on WhatsApp${
          attempts ? ` — attempt ${attempts}` : ''
        }. They have 48 hours to reply YES.`,
      });
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'The message could not be sent.' });
    }
  };

  const setField = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const openEdit = (p: PropertyEntity) => {
    setEditing(p);
    setEditForm({
      name: p.name,
      place: p.place,
      address: p.address,
      category: p.category,
      ownerName: p.ownerName,
      ownerMobile: p.ownerMobile,
      rent: String(p.rent),
      deposit: String(p.deposit),
      stayType: p.stayType,
      description: p.description,
    });
    setEditDetailRows(objectToRows(p.categoryDetails));
  };

  const setEditField =
    (key: keyof typeof EMPTY_FORM | 'description') => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setEditForm((f) => f && { ...f, [key]: e.target.value });

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editForm) return;
    setSaving(true);

    const res = await propertyService.updateProperty(editing.id, {
      name: editForm.name.trim(),
      place: editForm.place.trim(),
      address: editForm.address.trim(),
      category: editForm.category,
      stayType: editForm.stayType,
      ownerName: editForm.ownerName.trim(),
      ownerMobile: editForm.ownerMobile.trim(),
      rent: Number(editForm.rent) || 0,
      deposit: Number(editForm.deposit) || 0,
      description: editForm.description.trim(),
      categoryDetails: rowsToObject(editDetailRows),
    });

    setSaving(false);

    if (res.success) {
      setToast({ tone: 'good', message: `"${editForm.name}" updated.` });
      if (selected?.id === editing.id) setSelected(res.data);
      setEditing(null);
      setEditForm(null);
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Update failed.' });
    }
  };

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="Records"
        title="Properties"
        description="Accommodation listings onboarded by field agents, stored in the properties collection."
        actions={
          <>
            <IconButton
              icon={RefreshCw}
              label="Reload properties"
              onClick={reload}
              spinning={refreshing || loading}
            />
            <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
              Add property
            </Button>
          </>
        }
      />

      {/* Filters — one row above the content */}
      <Card padded={false} className="p-3">
        <Box className="flex flex-wrap items-center gap-2.5">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto min-w-36">
            <Option value="All">All categories</Option>
            {PROPERTY_CATEGORIES.map((c) => (
              <Option key={c} value={c}>
                {propertyCategoryLabel(c)}
              </Option>
            ))}
          </Select>

          <Select value={stayType} onChange={(e) => setStayType(e.target.value)} className="w-auto min-w-36">
            <Option value="All">All stay types</Option>
            {STAY_TYPES.map((s) => (
              <Option key={s} value={s}>
                {s}
              </Option>
            ))}
          </Select>

          {(category !== 'All' || stayType !== 'All') && (
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              onClick={() => {
                setCategory('All');
                setStayType('All');
              }}
            >
              Clear
            </Button>
          )}

          <Inline className="text-label text-ink-3 ml-auto tabular">
            {loading ? 'Loading…' : `${properties.length} of ${data?.length ?? 0} shown`}
          </Inline>

          <Box className="flex items-center gap-0.5 p-0.5 rounded-control bg-surface-inset">
            {([
              ['grid', LayoutGrid, 'Grid view'],
              ['table', List, 'Table view'],
            ] as const).map(([mode, Icon, label]) => (
              <PlainButton
                key={mode}
                onClick={() => setView(mode)}
                title={label}
                aria-label={label}
                aria-pressed={view === mode}
                className={cx(
                  'grid place-items-center size-7 rounded-[6px] transition-colors',
                  view === mode ? 'bg-surface text-ink shadow-[var(--shadow-sm)]' : 'text-ink-3 hover:text-ink'
                )}
              >
                <Icon className="size-4" strokeWidth={1.75} />
              </PlainButton>
            ))}
          </Box>
        </Box>
      </Card>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        view === 'grid' ? (
          <Box className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} padded={false} className="overflow-hidden">
                <Skeleton className="h-36 w-full rounded-none" />
                <Box className="p-4 space-y-2.5">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                  <Skeleton className="h-3 w-1/3" />
                </Box>
              </Card>
            ))}
          </Box>
        ) : (
          <Card padded={false}>
            <Table>
              <TableHead>
                <PlainTr>
                  <Th>Property</Th>
                  <Th>Category</Th>
                  <Th>Owner</Th>
                  <Th className="text-right">Rent</Th>
                  <Th className="text-right">Clicks</Th>
                  <Th>Onboarded</Th>
                  <Th />
                </PlainTr>
              </TableHead>
              <TableBody>
                <TableSkeleton cols={7} />
              </TableBody>
            </Table>
          </Card>
        )
      ) : !properties.length ? (
        <Card>
          <EmptyState
            icon={Building2}
            title={search || category !== 'All' || stayType !== 'All' ? 'No matching properties' : 'No properties yet'}
            description={
              search || category !== 'All' || stayType !== 'All'
                ? 'Try clearing the filters or the search box above.'
                : 'Listings onboarded through the field app will appear here.'
            }
            action={
              <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
                Add the first property
              </Button>
            }
          />
        </Card>
      ) : view === 'grid' ? (
        <Box className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {properties.map((p) => (
            <Card key={p.id} padded={false} className="overflow-hidden flex flex-col group">
              <PlainButton
                onClick={() => setSelected(p)}
                className="block text-left relative"
                aria-label={`Open ${p.name}`}
              >
                <Thumb property={p} className="h-36 w-full" />
                <Inline className="absolute top-2.5 left-2.5">
                  <Badge tone="neutral" className="bg-surface/90 backdrop-blur-sm">
                    {propertyCategoryLabel(p.category)}
                  </Badge>
                </Inline>
                {p.images.length > 1 && (
                  <Inline className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-control bg-surface/90 backdrop-blur-sm text-label text-ink-2 tabular">
                    {p.images.length} photos
                  </Inline>
                )}
              </PlainButton>

              <Box className="p-4 flex-1 flex flex-col">
                <PlainButton onClick={() => setSelected(p)} className="text-left">
                  <Heading level={3} className="text-section text-ink truncate group-hover:text-brand-ink transition-colors">
                    {p.name}
                  </Heading>
                </PlainButton>
                <Text className="text-sm text-ink-3 mt-1 flex items-center gap-1.5 truncate">
                  <MapPin className="size-3.5 shrink-0" strokeWidth={1.75} />
                  {p.place || 'Location not recorded'}
                </Text>

                {!p.isVerified && (
                  <Badge tone="warn" icon={Hourglass} className="mt-2 self-start">
                    Awaiting verification
                  </Badge>
                )}

                <Box className="mt-3 pt-3 border-t border-line flex items-end justify-between gap-3">
                  <Box>
                    <Text className="text-micro uppercase text-ink-3">Monthly rent</Text>
                    <Text className="text-body font-medium text-ink tabular mt-0.5">{rupees(p.rent)}</Text>
                  </Box>
                  <Box className="flex items-center gap-1">
                    <Inline className="text-label text-ink-3 tabular mr-1">{formatDate(p.createdAt)}</Inline>
                    <IconButton icon={Pencil} label={`Edit ${p.name}`} onClick={() => openEdit(p)} />
                    <IconButton
                      icon={Trash2}
                      label={`Delete ${p.name}`}
                      tone="danger"
                      onClick={() => setPendingDelete(p)}
                    />
                  </Box>
                </Box>
              </Box>
            </Card>
          ))}
        </Box>
      ) : (
        <Card padded={false}>
          <Table>
            <TableHead>
              <PlainTr>
                <Th>Property</Th>
                <Th>Category</Th>
                <Th>Owner</Th>
                <Th className="text-right">Rent</Th>
                <Th className="text-right" aria-sort={clickSort === 'none' ? 'none' : clickSort === 'desc' ? 'descending' : 'ascending'}>
                  <PlainButton
                    type="button"
                    onClick={cycleClickSort}
                    className="inline-flex items-center gap-1 hover:text-ink"
                    title="Sort by clicks"
                  >
                    Clicks
                    {clickSort === 'desc' ? (
                      <ArrowDown className="size-3" strokeWidth={2} />
                    ) : clickSort === 'asc' ? (
                      <ArrowUp className="size-3" strokeWidth={2} />
                    ) : (
                      <ArrowUpDown className="size-3 opacity-60" strokeWidth={2} />
                    )}
                  </PlainButton>
                </Th>
                <Th>Onboarded</Th>
                <Th />
              </PlainTr>
            </TableHead>
            <TableBody>
              {properties.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <PlainButton
                      onClick={() => setSelected(p)}
                      className="flex items-center gap-3 text-left group"
                    >
                      <Thumb property={p} className="size-9 rounded-control shrink-0" />
                      <Inline className="min-w-0">
                        <Inline className="block text-sm font-medium text-ink truncate max-w-56 group-hover:text-brand-ink transition-colors">
                          {p.name}
                        </Inline>
                        <Inline className="block text-label text-ink-3 truncate max-w-56">
                          {p.place || '—'}
                        </Inline>
                      </Inline>
                    </PlainButton>
                  </Td>
                  <Td>
                    <Box className="flex flex-col items-start gap-1">
                      <Badge tone="neutral">{propertyCategoryLabel(p.category)}</Badge>
                      {!p.isVerified && (
                        <Badge tone="warn" icon={Hourglass}>
                          Awaiting verification
                        </Badge>
                      )}
                    </Box>
                  </Td>
                  <Td>
                    <Inline className="block text-sm text-ink truncate max-w-40">{p.ownerName || '—'}</Inline>
                    <Inline className="block text-label text-ink-3 font-mono tabular">
                      {p.ownerMobile || '—'}
                    </Inline>
                  </Td>
                  <Td className="text-right text-ink tabular">{rupees(p.rent)}</Td>
                  <Td className="text-right tabular">
                    {p.clickCount === null ? '—' : p.clickCount.toLocaleString('en-IN')}
                  </Td>
                  <Td className="tabular">{formatDate(p.createdAt)}</Td>
                  <Td className="text-right">
                    <Box className="flex items-center justify-end gap-0.5">
                      <IconButton icon={Pencil} label={`Edit ${p.name}`} onClick={() => openEdit(p)} />
                      <IconButton
                        icon={Trash2}
                        label={`Delete ${p.name}`}
                        tone="danger"
                        onClick={() => setPendingDelete(p)}
                      />
                    </Box>
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Detail drawer */}
      {selected && (
        <>
          <Box
            className="fixed inset-0 z-40 bg-[rgb(9_12_20/0.45)] backdrop-blur-[2px]"
            onClick={() => setSelected(null)}
            aria-hidden
          />
          <Aside
            role="dialog"
            aria-label={selected.name}
            className="fixed top-0 bottom-0 right-0 z-50 w-full max-w-md bg-surface border-l border-line flex flex-col anim-slide-left"
          >
            <Box className="h-14 px-4 border-b border-line flex items-center justify-between gap-3 shrink-0">
              <Box className="min-w-0">
                <Heading level={2} className="text-section text-ink truncate">{selected.name}</Heading>
                <Text className="text-label text-ink-3 flex items-center gap-1.5">
                  {propertyCategoryLabel(selected.category)}
                  {!selected.isVerified && (
                    <Badge tone="warn" icon={Hourglass}>
                      Awaiting verification
                    </Badge>
                  )}
                </Text>
              </Box>
              <IconButton icon={X} label="Close" onClick={() => setSelected(null)} />
            </Box>

            {!selected.isVerified && (
              <Box className="px-4 pt-3 space-y-2">
                <Text className="text-label text-ink-3 leading-relaxed">
                  Not yet a live listing — this is a snapshot from an onboarding request still awaiting owner or
                  verifier confirmation on WhatsApp. Editing or deleting it updates or cancels that request.
                </Text>

                {/* Always the OWNER's message, never the verification team's.
                    The team is only asked once the owner has replied YES, so a
                    listing stuck at either stage is answered by asking the
                    owner again — and resending to the team would ask somebody
                    to confirm a listing its owner never agreed to.

                    Sits here rather than in the footer beside Edit and Delete
                    because it only exists while this paragraph does, and
                    because three buttons do not fit the footer at this width. */}
                <Button
                  variant="secondary"
                  icon={Send}
                  loading={resending}
                  onClick={() => handleResend(selected)}
                >
                  Resend verification to owner
                </Button>
                <Text className="text-micro text-ink-3 leading-relaxed">
                  Sends the approval message to {selected.ownerMobile || 'the owner'} again and restarts the
                  48-hour window. Correct the number with Edit first if it is wrong — the resend reads it back
                  from this snapshot.
                </Text>
              </Box>
            )}

            <Box className="flex-1 overflow-y-auto">
              {selected.images.length > 0 && (
                <Box className="flex gap-2 p-4 overflow-x-auto">
                  {selected.images.map((img, i) => (
                    <Image
                      key={`${img}-${i}`}
                      src={img}
                      alt=""
                      loading="lazy"
                      className="h-28 w-40 shrink-0 object-cover rounded-panel bg-surface-inset"
                    />
                  ))}
                </Box>
              )}

              <Box className="px-4 pb-4 space-y-5">
                {selected.documents && selected.documents.length > 0 && (
                  <Region>
                    <Heading level={3} className="text-micro uppercase text-ink-3 mb-1">Verification documents</Heading>
                    {/* Sensitive. These links are public-read on Cloudinary —
                        unguessable, not private — so they open in a new tab
                        rather than rendering inline in a console that is often
                        on screen next to somebody else. */}
                    {selected.documents.map((doc, i) => (
                      <DataRow
                        key={`${doc.url}-${i}`}
                        label={doc.kind === 'pan' ? 'Owner / business PAN' : (doc.docType || 'Proof of premises')}
                        value={
                          <Link
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-accent underline underline-offset-2"
                          >
                            {doc.name || 'Open document'}
                          </Link>
                        }
                      />
                    ))}
                  </Region>
                )}

                <Region>
                  <Heading level={3} className="text-micro uppercase text-ink-3 mb-1">Pricing</Heading>
                  <DataRow label="Monthly rent" value={rupees(selected.rent)} mono />
                  <DataRow label="Monthly price" value={rupees(selected.monthlyPrice)} mono />
                  <DataRow label="Daily price" value={rupees(selected.dailyPrice)} mono />
                  <DataRow label="Deposit" value={rupees(selected.deposit)} mono />
                </Region>

                <Region>
                  <Heading level={3} className="text-micro uppercase text-ink-3 mb-1">Owner</Heading>
                  <DataRow label="Name" value={selected.ownerName || '—'} />
                  <DataRow label="WhatsApp" value={selected.ownerMobile || '—'} mono />
                  {selected.ownerAltMobile && (
                    <DataRow label="Mobile" value={selected.ownerAltMobile} mono />
                  )}
                </Region>

                <Region>
                  <Heading level={3} className="text-micro uppercase text-ink-3 mb-1">Location</Heading>
                  <DataRow label="Place" value={selected.place || '—'} />
                  <DataRow label="Address" value={selected.address || '—'} />
                </Region>

                <Region>
                  <Heading level={3} className="text-micro uppercase text-ink-3 mb-1">Stay</Heading>
                  <DataRow label="Stay type" value={selected.stayType} />
                  <DataRow label="Short stay" value={selected.shortStayDuration || '—'} />
                  <DataRow label="Long stay" value={selected.longStayDuration || '—'} />
                </Region>

                {selected.amenities.length > 0 && (
                  <Region>
                    <Heading level={3} className="text-micro uppercase text-ink-3 mb-2">Amenities</Heading>
                    <Box className="flex flex-wrap gap-1.5">
                      {selected.amenities.map((a) => (
                        <Badge key={a} tone="neutral">
                          {a}
                        </Badge>
                      ))}
                    </Box>
                  </Region>
                )}

                {selected.description && (
                  <Region>
                    <Heading level={3} className="text-micro uppercase text-ink-3 mb-1">Description</Heading>
                    <Text className="text-sm text-ink-2 leading-relaxed whitespace-pre-wrap">
                      {selected.description}
                    </Text>
                  </Region>
                )}

                {/* Total beds next to what is FREE right now — the number
                    students see as "N left". See BedAvailability. */}
                <BedAvailability
                  key={selected.id}
                  propertyId={selected.id}
                  isVerified={selected.isVerified}
                  capacityHint="Add it with Edit → sharingBeds."
                  onToast={setToast}
                />

                {(() => {
                  const detailRows = describeCategoryDetails(selected.categoryDetails);
                  return detailRows.length > 0 ? (
                    <Region>
                      <Heading level={3} className="text-micro uppercase text-ink-3 mb-1">
                        {propertyCategoryLabel(selected.category)} details
                      </Heading>
                      {detailRows.map((row) => (
                        <DataRow key={row.key} label={row.label} value={row.value} />
                      ))}
                    </Region>
                  ) : null;
                })()}

                <Region>
                  <Heading level={3} className="text-micro uppercase text-ink-3 mb-1">Record</Heading>
                  <DataRow
                    label="Clicks"
                    value={
                      selected.clickCount === null
                        ? 'Not public yet'
                        : `${selected.clickCount.toLocaleString('en-IN')} (app + lampose.com)`
                    }
                    mono={selected.clickCount !== null}
                  />
                  <DataRow label="Onboarded by" value={selected.employeeEmail || 'Not recorded'} />
                  <DataRow label="Created" value={formatDateTime(selected.createdAt)} />
                  <DataRow label="Updated" value={formatDateTime(selected.updatedAt)} />
                  <DataRow label="Document ID" value={selected.id} mono />
                </Region>
              </Box>
            </Box>

            <Box className="p-3 border-t border-line flex justify-between gap-2 shrink-0">
              <Button variant="secondary" icon={Pencil} onClick={() => openEdit(selected)}>
                Edit
              </Button>
              <Button variant="danger" icon={Trash2} onClick={() => setPendingDelete(selected)}>
                Delete property
              </Button>
            </Box>
          </Aside>
        </>
      )}

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add property"
        description="Writes a new document to the properties collection."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" form="create-property" type="submit" loading={saving}>
              Create property
            </Button>
          </>
        }
      >
        <Form id="create-property" onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <Text className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
              {formError}
            </Text>
          )}

          <Field label="Property name" required>
            <Input required value={form.name} onChange={setField('name')} placeholder="Sunrise Residency" />
          </Field>

          <Box className="grid grid-cols-2 gap-3">
            <Field label="Category" required>
              <Select value={form.category} onChange={setField('category')}>
                {PROPERTY_CATEGORIES.map((c) => (
                  <Option key={c} value={c}>
                    {propertyCategoryLabel(c)}
                  </Option>
                ))}
              </Select>
            </Field>
            <Field label="Stay type">
              <Select value={form.stayType} onChange={setField('stayType')}>
                {STAY_TYPES.map((s) => (
                  <Option key={s} value={s}>
                    {s}
                  </Option>
                ))}
              </Select>
            </Field>
          </Box>

          <Field label="Place" required hint="Locality and city, as recorded by the field agent.">
            <Input
              required
              value={form.place}
              onChange={setField('place')}
              placeholder="HSR Layout, Bangalore"
            />
          </Field>

          <Field label="Full address">
            <Input value={form.address} onChange={setField('address')} placeholder="Street, landmark, PIN" />
          </Field>

          <Box className="grid grid-cols-2 gap-3">
            <Field label="Owner name" required>
              <Input required value={form.ownerName} onChange={setField('ownerName')} />
            </Field>
            <Field label="Owner mobile" required>
              <Input
                required
                value={form.ownerMobile}
                onChange={setField('ownerMobile')}
                placeholder="+91 98765 43210"
                className="font-mono"
              />
            </Field>
          </Box>

          <Box className="grid grid-cols-2 gap-3">
            <Field label="Monthly rent (₹)" required>
              <Input
                required
                type="number"
                min="0"
                value={form.rent}
                onChange={setField('rent')}
                className="tabular"
              />
            </Field>
            <Field label="Deposit (₹)">
              <Input
                type="number"
                min="0"
                value={form.deposit}
                onChange={setField('deposit')}
                className="tabular"
              />
            </Field>
          </Box>
        </Form>
      </Modal>

      {/* Edit */}
      <Modal
        open={!!editing && !!editForm}
        onClose={() => {
          setEditing(null);
          setEditForm(null);
        }}
        title={`Edit ${editing?.name ?? ''}`}
        description="Updates the document in the properties collection."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" form="edit-property" type="submit" loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        {editForm && (
          <Form id="edit-property" onSubmit={handleUpdate} className="space-y-4">
            <Field label="Property name" required>
              <Input required value={editForm.name} onChange={setEditField('name')} />
            </Field>

            <Box className="grid grid-cols-2 gap-3">
              <Field label="Category" required>
                <Select value={editForm.category} onChange={setEditField('category')}>
                  {PROPERTY_CATEGORIES.map((c) => (
                    <Option key={c} value={c}>
                      {propertyCategoryLabel(c)}
                    </Option>
                  ))}
                </Select>
              </Field>
              <Field label="Stay type">
                <Select value={editForm.stayType} onChange={setEditField('stayType')}>
                  {STAY_TYPES.map((s) => (
                    <Option key={s} value={s}>
                      {s}
                    </Option>
                  ))}
                </Select>
              </Field>
            </Box>

            <Field label="Place" required>
              <Input required value={editForm.place} onChange={setEditField('place')} />
            </Field>

            <Field label="Full address">
              <Input value={editForm.address} onChange={setEditField('address')} />
            </Field>

            <Box className="grid grid-cols-2 gap-3">
              <Field label="Owner name" required>
                <Input required value={editForm.ownerName} onChange={setEditField('ownerName')} />
              </Field>
              <Field label="Owner mobile" required>
                <Input required value={editForm.ownerMobile} onChange={setEditField('ownerMobile')} className="font-mono" />
              </Field>
            </Box>

            <Box className="grid grid-cols-2 gap-3">
              <Field label="Monthly rent (₹)" required>
                <Input required type="number" min="0" value={editForm.rent} onChange={setEditField('rent')} className="tabular" />
              </Field>
              <Field label="Deposit (₹)">
                <Input type="number" min="0" value={editForm.deposit} onChange={setEditField('deposit')} className="tabular" />
              </Field>
            </Box>

            <Field label="Description" hint="Free text shown to whoever reads this listing's full detail.">
              <PlainTextarea
                value={editForm.description}
                onChange={setEditField('description')}
                rows={3}
                className="field min-h-20 resize-y"
              />
            </Field>

            <Field
              label={`${editForm.category} details`}
              hint='Schema-less by design — values are parsed as JSON when possible (8000, true, ["Single","2 Sharing"]), otherwise kept as plain text.'
            >
              <KeyValueEditor rows={editDetailRows} onChange={setEditDetailRows} />
            </Field>

            {/* Free beds save on their own, straight away — the total above
                (sharingBeds) saves with "Save". */}
            {editing && (
              <BedAvailability
                key={editing.id}
                propertyId={editing.id}
                isVerified={editing.isVerified}
                capacityHint='Add a "sharingBeds" entry above and save.'
                onToast={setToast}
              />
            )}
          </Form>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete property"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} loading={deleting} onClick={handleDelete}>
              Delete permanently
            </Button>
          </>
        }
      >
        <Text className="text-body text-ink-2">
          {pendingDelete?.isVerified ? (
            <>
              “<Inline className="text-ink font-medium">{pendingDelete?.name}</Inline>” will be removed from the
              properties collection. This cannot be undone.
            </>
          ) : (
            <>
              “<Inline className="text-ink font-medium">{pendingDelete?.name}</Inline>” hasn't been verified yet — this
              cancels its onboarding request instead of deleting a live listing. This cannot be undone.
            </>
          )}
        </Text>
        {pendingDelete && (
          <Box className="mt-3 space-y-1">
            <Text className="text-sm text-ink-3 flex items-center gap-2">
              <MapPin className="size-3.5" strokeWidth={1.75} /> {pendingDelete.place || '—'}
            </Text>
            <Text className="text-sm text-ink-3 flex items-center gap-2">
              <User className="size-3.5" strokeWidth={1.75} /> {pendingDelete.ownerName || '—'}
            </Text>
            <Text className="text-sm text-ink-3 flex items-center gap-2">
              <Phone className="size-3.5" strokeWidth={1.75} /> {pendingDelete.ownerMobile || '—'}
            </Text>
            <Text className="text-sm text-ink-3 flex items-center gap-2">
              <Calendar className="size-3.5" strokeWidth={1.75} /> Added {formatDate(pendingDelete.createdAt)}
            </Text>
          </Box>
        )}
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
