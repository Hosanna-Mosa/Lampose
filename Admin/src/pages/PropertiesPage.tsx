import React, { useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  Hourglass,
  ImageOff,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DataRow,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Table,
  TableSkeleton,
  Td,
  Th,
  Toast,
  Tr,
  cx,
  type ToastState,
} from '../components/ui';
import { propertyService } from '../api/services/propertyService';
import { useFetch } from '../lib/useFetch';
import { PROPERTY_CATEGORIES, STAY_TYPES } from '../lib/domain';
import { formatDate, formatDateTime, rupees } from '../lib/format';
import type { PropertyEntity } from '../api/types';

interface PropertiesPageProps {
  search: string;
}

const EMPTY_FORM = {
  name: '',
  place: '',
  address: '',
  category: 'PG',
  ownerName: '',
  ownerMobile: '',
  rent: '',
  deposit: '',
  stayType: 'Long Stay',
};

/** Listing thumbnail, falling back to a neutral placeholder when the record has
 *  no image or the Cloudinary URL fails to load. */
const Thumb: React.FC<{ property: PropertyEntity; className?: string }> = ({ property, className }) => {
  const [failed, setFailed] = useState(false);
  const src = property.imageUrl;
  const usable = src && !failed && !src.startsWith('/');

  if (!usable) {
    return (
      <div className={cx('grid place-items-center bg-surface-inset text-ink-3', className)}>
        <ImageOff className="size-5" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cx('object-cover bg-surface-inset', className)}
    />
  );
};

/* ── Category details ─────────────────────────────────────────────────────
   `categoryDetails` is `Mixed` in property.model.js — its shape depends on
   `category` and isn't validated, so it's read and edited generically rather
   than through a form that would have to guess a schema. The known keys
   (documented in Backend/src/modules/listings/sharing.util.js) get a
   friendly label and layout below; anything else still shows, just less
   dressed up, so nothing the onboarding app sends is ever hidden. */

const KNOWN_DETAIL_KEYS = new Set([
  'sharingTypes', 'roomTypes', 'bedType', 'roomType', 'sharingPrices',
  'foodIncluded', 'foodType', 'curfewTime', 'hostelType', 'rateType',
]);

const humanizeKey = (key: string): string =>
  key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

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
  if (typeof details.roomType === 'string' && details.roomType) {
    rows.push({ key: 'roomType', label: 'Room type', value: details.roomType });
  }

  const prices = details.sharingPrices;
  if (prices && typeof prices === 'object' && !Array.isArray(prices) && Object.keys(prices).length) {
    rows.push({
      key: 'sharingPrices',
      label: 'Pricing by option',
      value: (
        <div className="space-y-1">
          {Object.entries(prices as Record<string, unknown>).map(([label, price]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <span className="text-ink">{label}</span>
              <span className="tabular">{rupees(Number(price) || 0)}</span>
            </div>
          ))}
        </div>
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

interface KVRow {
  key: string;
  value: string;
}

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

/** Generic editor for a schema-less object — every field on `categoryDetails`
 *  the onboarding app might send, without this console having to know its
 *  shape in advance. */
const KeyValueEditor: React.FC<{ rows: KVRow[]; onChange: (rows: KVRow[]) => void }> = ({ rows, onChange }) => {
  const update = (i: number, patch: Partial<KVRow>) =>
    onChange(rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder="key"
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
            className="w-2/5 font-mono text-sm"
          />
          <Input
            placeholder="value"
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
            className="flex-1 font-mono text-sm"
          />
          <IconButton icon={Trash2} label={`Remove ${row.key || 'field'}`} tone="danger" onClick={() => remove(i)} />
        </div>
      ))}
      <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => onChange([...rows, { key: '', value: '' }])}>
        Add field
      </Button>
    </div>
  );
};

export const PropertiesPage: React.FC<PropertiesPageProps> = ({ search }) => {
  const [category, setCategory] = useState('All');
  const [stayType, setStayType] = useState('All');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [selected, setSelected] = useState<PropertyEntity | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PropertyEntity | null>(null);
  const [deleting, setDeleting] = useState(false);
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

  // The header filter narrows what is already loaded, so typing costs no request.
  const properties = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) =>
      [p.name, p.place, p.ownerName, p.ownerMobile, p.address, p.employeeEmail]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q))
    );
  }, [data, search]);

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
    <div className="space-y-5">
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
        <div className="flex flex-wrap items-center gap-2.5">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto min-w-36">
            <option value="All">All categories</option>
            {PROPERTY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          <Select value={stayType} onChange={(e) => setStayType(e.target.value)} className="w-auto min-w-36">
            <option value="All">All stay types</option>
            {STAY_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
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

          <span className="text-label text-ink-3 ml-auto tabular">
            {loading ? 'Loading…' : `${properties.length} of ${data?.length ?? 0} shown`}
          </span>

          <div className="flex items-center gap-0.5 p-0.5 rounded-control bg-surface-inset">
            {([
              ['grid', LayoutGrid, 'Grid view'],
              ['table', List, 'Table view'],
            ] as const).map(([mode, Icon, label]) => (
              <button
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
              </button>
            ))}
          </div>
        </div>
      </Card>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} padded={false} className="overflow-hidden">
                <Skeleton className="h-36 w-full rounded-none" />
                <div className="p-4 space-y-2.5">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card padded={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Property</Th>
                  <Th>Category</Th>
                  <Th>Owner</Th>
                  <Th className="text-right">Rent</Th>
                  <Th>Onboarded</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                <TableSkeleton cols={6} />
              </tbody>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {properties.map((p) => (
            <Card key={p.id} padded={false} className="overflow-hidden flex flex-col group">
              <button
                onClick={() => setSelected(p)}
                className="block text-left relative"
                aria-label={`Open ${p.name}`}
              >
                <Thumb property={p} className="h-36 w-full" />
                <span className="absolute top-2.5 left-2.5">
                  <Badge tone="neutral" className="bg-surface/90 backdrop-blur-sm">
                    {p.category}
                  </Badge>
                </span>
                {p.images.length > 1 && (
                  <span className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-control bg-surface/90 backdrop-blur-sm text-label text-ink-2 tabular">
                    {p.images.length} photos
                  </span>
                )}
              </button>

              <div className="p-4 flex-1 flex flex-col">
                <button onClick={() => setSelected(p)} className="text-left">
                  <h3 className="text-section text-ink truncate group-hover:text-brand-ink transition-colors">
                    {p.name}
                  </h3>
                </button>
                <p className="text-sm text-ink-3 mt-1 flex items-center gap-1.5 truncate">
                  <MapPin className="size-3.5 shrink-0" strokeWidth={1.75} />
                  {p.place || 'Location not recorded'}
                </p>

                {!p.isVerified && (
                  <Badge tone="warn" icon={Hourglass} className="mt-2 self-start">
                    Awaiting verification
                  </Badge>
                )}

                <div className="mt-3 pt-3 border-t border-line flex items-end justify-between gap-3">
                  <div>
                    <p className="text-micro uppercase text-ink-3">Monthly rent</p>
                    <p className="text-body font-medium text-ink tabular mt-0.5">{rupees(p.rent)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-label text-ink-3 tabular mr-1">{formatDate(p.createdAt)}</span>
                    <IconButton icon={Pencil} label={`Edit ${p.name}`} onClick={() => openEdit(p)} />
                    <IconButton
                      icon={Trash2}
                      label={`Delete ${p.name}`}
                      tone="danger"
                      onClick={() => setPendingDelete(p)}
                    />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card padded={false}>
          <Table>
            <thead>
              <tr>
                <Th>Property</Th>
                <Th>Category</Th>
                <Th>Owner</Th>
                <Th className="text-right">Rent</Th>
                <Th>Onboarded</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <button
                      onClick={() => setSelected(p)}
                      className="flex items-center gap-3 text-left group"
                    >
                      <Thumb property={p} className="size-9 rounded-control shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink truncate max-w-56 group-hover:text-brand-ink transition-colors">
                          {p.name}
                        </span>
                        <span className="block text-label text-ink-3 truncate max-w-56">
                          {p.place || '—'}
                        </span>
                      </span>
                    </button>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <Badge tone="neutral">{p.category}</Badge>
                      {!p.isVerified && (
                        <Badge tone="warn" icon={Hourglass}>
                          Awaiting verification
                        </Badge>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <span className="block text-sm text-ink truncate max-w-40">{p.ownerName || '—'}</span>
                    <span className="block text-label text-ink-3 font-mono tabular">
                      {p.ownerMobile || '—'}
                    </span>
                  </Td>
                  <Td className="text-right text-ink tabular">{rupees(p.rent)}</Td>
                  <Td className="tabular">{formatDate(p.createdAt)}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <IconButton icon={Pencil} label={`Edit ${p.name}`} onClick={() => openEdit(p)} />
                      <IconButton
                        icon={Trash2}
                        label={`Delete ${p.name}`}
                        tone="danger"
                        onClick={() => setPendingDelete(p)}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Detail drawer */}
      {selected && (
        <>
          <div
            className="fixed inset-0 z-40 bg-[rgb(9_12_20/0.45)] backdrop-blur-[2px]"
            onClick={() => setSelected(null)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label={selected.name}
            className="fixed top-0 bottom-0 right-0 z-50 w-full max-w-md bg-surface border-l border-line flex flex-col anim-slide-left"
          >
            <div className="h-14 px-4 border-b border-line flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h2 className="text-section text-ink truncate">{selected.name}</h2>
                <p className="text-label text-ink-3 flex items-center gap-1.5">
                  {selected.category}
                  {!selected.isVerified && (
                    <Badge tone="warn" icon={Hourglass}>
                      Awaiting verification
                    </Badge>
                  )}
                </p>
              </div>
              <IconButton icon={X} label="Close" onClick={() => setSelected(null)} />
            </div>

            {!selected.isVerified && (
              <p className="px-4 pt-3 text-label text-ink-3 leading-relaxed">
                Not yet a live listing — this is a snapshot from an onboarding request still awaiting owner or
                verifier confirmation on WhatsApp. Editing or deleting it updates or cancels that request.
              </p>
            )}

            <div className="flex-1 overflow-y-auto">
              {selected.images.length > 0 && (
                <div className="flex gap-2 p-4 overflow-x-auto">
                  {selected.images.map((img, i) => (
                    <img
                      key={`${img}-${i}`}
                      src={img}
                      alt=""
                      loading="lazy"
                      className="h-28 w-40 shrink-0 object-cover rounded-panel bg-surface-inset"
                    />
                  ))}
                </div>
              )}

              <div className="px-4 pb-4 space-y-5">
                <section>
                  <h3 className="text-micro uppercase text-ink-3 mb-1">Pricing</h3>
                  <DataRow label="Monthly rent" value={rupees(selected.rent)} mono />
                  <DataRow label="Monthly price" value={rupees(selected.monthlyPrice)} mono />
                  <DataRow label="Daily price" value={rupees(selected.dailyPrice)} mono />
                  <DataRow label="Deposit" value={rupees(selected.deposit)} mono />
                </section>

                <section>
                  <h3 className="text-micro uppercase text-ink-3 mb-1">Owner</h3>
                  <DataRow label="Name" value={selected.ownerName || '—'} />
                  <DataRow label="WhatsApp" value={selected.ownerMobile || '—'} mono />
                  {selected.ownerAltMobile && (
                    <DataRow label="Mobile" value={selected.ownerAltMobile} mono />
                  )}
                </section>

                <section>
                  <h3 className="text-micro uppercase text-ink-3 mb-1">Location</h3>
                  <DataRow label="Place" value={selected.place || '—'} />
                  <DataRow label="Address" value={selected.address || '—'} />
                </section>

                <section>
                  <h3 className="text-micro uppercase text-ink-3 mb-1">Stay</h3>
                  <DataRow label="Stay type" value={selected.stayType} />
                  <DataRow label="Short stay" value={selected.shortStayDuration || '—'} />
                  <DataRow label="Long stay" value={selected.longStayDuration || '—'} />
                </section>

                {selected.amenities.length > 0 && (
                  <section>
                    <h3 className="text-micro uppercase text-ink-3 mb-2">Amenities</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.amenities.map((a) => (
                        <Badge key={a} tone="neutral">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}

                {selected.description && (
                  <section>
                    <h3 className="text-micro uppercase text-ink-3 mb-1">Description</h3>
                    <p className="text-sm text-ink-2 leading-relaxed whitespace-pre-wrap">
                      {selected.description}
                    </p>
                  </section>
                )}

                {(() => {
                  const detailRows = describeCategoryDetails(selected.categoryDetails);
                  return detailRows.length > 0 ? (
                    <section>
                      <h3 className="text-micro uppercase text-ink-3 mb-1">
                        {selected.category} details
                      </h3>
                      {detailRows.map((row) => (
                        <DataRow key={row.key} label={row.label} value={row.value} />
                      ))}
                    </section>
                  ) : null;
                })()}

                <section>
                  <h3 className="text-micro uppercase text-ink-3 mb-1">Record</h3>
                  <DataRow label="Onboarded by" value={selected.employeeEmail || 'Not recorded'} />
                  <DataRow label="Created" value={formatDateTime(selected.createdAt)} />
                  <DataRow label="Updated" value={formatDateTime(selected.updatedAt)} />
                  <DataRow label="Document ID" value={selected.id} mono />
                </section>
              </div>
            </div>

            <div className="p-3 border-t border-line flex justify-between gap-2 shrink-0">
              <Button variant="secondary" icon={Pencil} onClick={() => openEdit(selected)}>
                Edit
              </Button>
              <Button variant="danger" icon={Trash2} onClick={() => setPendingDelete(selected)}>
                Delete property
              </Button>
            </div>
          </aside>
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
        <form id="create-property" onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <p className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
              {formError}
            </p>
          )}

          <Field label="Property name" required>
            <Input required value={form.name} onChange={setField('name')} placeholder="Sunrise Residency" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" required>
              <Select value={form.category} onChange={setField('category')}>
                {PROPERTY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Stay type">
              <Select value={form.stayType} onChange={setField('stayType')}>
                {STAY_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

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

          <div className="grid grid-cols-2 gap-3">
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
          </div>

          <div className="grid grid-cols-2 gap-3">
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
          </div>
        </form>
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
          <form id="edit-property" onSubmit={handleUpdate} className="space-y-4">
            <Field label="Property name" required>
              <Input required value={editForm.name} onChange={setEditField('name')} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category" required>
                <Select value={editForm.category} onChange={setEditField('category')}>
                  {PROPERTY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Stay type">
                <Select value={editForm.stayType} onChange={setEditField('stayType')}>
                  {STAY_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Place" required>
              <Input required value={editForm.place} onChange={setEditField('place')} />
            </Field>

            <Field label="Full address">
              <Input value={editForm.address} onChange={setEditField('address')} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Owner name" required>
                <Input required value={editForm.ownerName} onChange={setEditField('ownerName')} />
              </Field>
              <Field label="Owner mobile" required>
                <Input required value={editForm.ownerMobile} onChange={setEditField('ownerMobile')} className="font-mono" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly rent (₹)" required>
                <Input required type="number" min="0" value={editForm.rent} onChange={setEditField('rent')} className="tabular" />
              </Field>
              <Field label="Deposit (₹)">
                <Input type="number" min="0" value={editForm.deposit} onChange={setEditField('deposit')} className="tabular" />
              </Field>
            </div>

            <Field label="Description" hint="Free text shown to whoever reads this listing's full detail.">
              <textarea
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
          </form>
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
        <p className="text-body text-ink-2">
          {pendingDelete?.isVerified ? (
            <>
              “<span className="text-ink font-medium">{pendingDelete?.name}</span>” will be removed from the
              properties collection. This cannot be undone.
            </>
          ) : (
            <>
              “<span className="text-ink font-medium">{pendingDelete?.name}</span>” hasn't been verified yet — this
              cancels its onboarding request instead of deleting a live listing. This cannot be undone.
            </>
          )}
        </p>
        {pendingDelete && (
          <div className="mt-3 space-y-1">
            <p className="text-sm text-ink-3 flex items-center gap-2">
              <MapPin className="size-3.5" strokeWidth={1.75} /> {pendingDelete.place || '—'}
            </p>
            <p className="text-sm text-ink-3 flex items-center gap-2">
              <User className="size-3.5" strokeWidth={1.75} /> {pendingDelete.ownerName || '—'}
            </p>
            <p className="text-sm text-ink-3 flex items-center gap-2">
              <Phone className="size-3.5" strokeWidth={1.75} /> {pendingDelete.ownerMobile || '—'}
            </p>
            <p className="text-sm text-ink-3 flex items-center gap-2">
              <Calendar className="size-3.5" strokeWidth={1.75} /> Added {formatDate(pendingDelete.createdAt)}
            </p>
          </div>
        )}
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
