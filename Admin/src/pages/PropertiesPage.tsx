import React, { useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  ImageOff,
  LayoutGrid,
  List,
  MapPin,
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
      setToast({ tone: 'good', message: `“${pendingDelete.name}” deleted.` });
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

                <div className="mt-3 pt-3 border-t border-line flex items-end justify-between gap-3">
                  <div>
                    <p className="text-micro uppercase text-ink-3">Monthly rent</p>
                    <p className="text-body font-medium text-ink tabular mt-0.5">{rupees(p.rent)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-label text-ink-3 tabular mr-1">{formatDate(p.createdAt)}</span>
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
                    <Badge tone="neutral">{p.category}</Badge>
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
                    <IconButton
                      icon={Trash2}
                      label={`Delete ${p.name}`}
                      tone="danger"
                      onClick={() => setPendingDelete(p)}
                    />
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
                <p className="text-label text-ink-3">{selected.category}</p>
              </div>
              <IconButton icon={X} label="Close" onClick={() => setSelected(null)} />
            </div>

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
                  <DataRow label="Mobile" value={selected.ownerMobile || '—'} mono />
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

                <section>
                  <h3 className="text-micro uppercase text-ink-3 mb-1">Record</h3>
                  <DataRow label="Onboarded by" value={selected.employeeEmail || 'Not recorded'} />
                  <DataRow label="Created" value={formatDateTime(selected.createdAt)} />
                  <DataRow label="Updated" value={formatDateTime(selected.updatedAt)} />
                  <DataRow label="Document ID" value={selected.id} mono />
                </section>
              </div>
            </div>

            <div className="p-3 border-t border-line flex justify-end shrink-0">
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
          “<span className="text-ink font-medium">{pendingDelete?.name}</span>” will be removed from the
          properties collection. This cannot be undone.
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
