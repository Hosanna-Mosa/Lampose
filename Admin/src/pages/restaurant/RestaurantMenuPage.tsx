/* ══════════════════════════════════════════════════════════════════════════
   Menu — the dishes this restaurant sells.

   Full control: add a dish, change one, take one off the menu, and switch one
   in or out of stock. All four go to `/v1/restaurant-admin/menu`, scoped by
   the server to the shop in the owner's token.

   ## Out of stock is not the same as deleted, and the page says so

   The switch on each row is the one an owner touches twenty times an evening
   — paneer runs out at eight, comes back tomorrow. Deleting is a different
   act with a different button and a confirmation behind it, because a dish
   removed takes its photographs, its variants and its add-ons with it and
   nothing brings them back.

   The switch sends the STATE it was set to rather than a toggle, matching the
   server. A toggle is resolved against whatever the server holds when it
   arrives, so a double click, a retry on a bad connection, or the same shop
   open on a phone and a laptop all land somewhere nobody chose.

   ## Sold-out dishes are listed

   Unlike the customer-facing menu, which hides them. Switching one back on is
   the whole reason somebody opens this page, and a dish that vanished when it
   sold out is one nobody can restore.

   ## Validation belongs to the server

   `readMenuFields` on the backend collects EVERY problem with a save in one
   pass and joins them into one message, deliberately, so nobody learns about
   four bad fields one save at a time. That whole sentence is shown at the top
   of the form.

   This page does not re-implement any of those rules. A price that is not a
   number, an offer that is not below the price, a name too long for the card
   — all of them are the server's judgement. A copy of the rules here would be
   a second answer to the same question, and the two would drift the first
   time one of them changed.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpenText,
  Circle,
  Flame,
  ImageOff,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Badge } from '../../components/common/atoms/Badge';
import { Box } from '../../components/common/atoms/Box';
import { Button } from '../../components/common/atoms/Button';
import { Card } from '../../components/common/atoms/Card';
import { IconButton } from '../../components/common/atoms/IconButton';
import { Image } from '../../components/common/atoms/Image';
import { Inline } from '../../components/common/atoms/Inline';
import { Input } from '../../components/common/atoms/Input';
import { Option } from '../../components/common/atoms/Option';
import { PlainTd, PlainTr, TableBody, TableHead } from '../../components/common/atoms/PlainTable';
import { Select } from '../../components/common/atoms/Select';
import { Strong } from '../../components/common/atoms/Strong';
import { Switch } from '../../components/common/atoms/Switch';
import { Table, Td, Th, Tr } from '../../components/common/atoms/Table';
import { Text } from '../../components/common/atoms/Text';
import { Textarea } from '../../components/common/atoms/Textarea';
import { EmptyState } from '../../components/common/molecules/EmptyState';
import { ErrorState } from '../../components/common/molecules/ErrorState';
import { Field } from '../../components/common/molecules/Field';
import { PageHeader } from '../../components/common/molecules/PageHeader';
import { TableSkeleton } from '../../components/common/molecules/TableSkeleton';
import { Modal } from '../../components/common/organisms/Modal';
import { Toast } from '../../components/common/organisms/Toast';
import type { ToastState } from '../../components/common/organisms/Toast';
import { restaurantAdminService } from '../../api/services/restaurantAdminService';
import type {
  IsVeg,
  MenuItem,
  MenuItemInput,
  SpiceLevel,
} from '../../api/services/restaurantAdminService';
import { useFetch } from '../../lib/useFetch';
import { rupees } from '../../lib/format';

interface RestaurantMenuPageProps {
  search: string;
}

const VEG_LOOK: Record<IsVeg, { label: string; tone: 'good' | 'crit' | 'warn' }> = {
  veg: { label: 'Veg', tone: 'good' },
  'non-veg': { label: 'Non-veg', tone: 'crit' },
  /* Its own value rather than folded into non-veg: a dish filed as non-veg
     because it contains egg is a dish that will not be shown to people who
     would have ordered it. The model keeps the three apart for that reason. */
  egg: { label: 'Egg', tone: 'warn' },
};

const SPICE_LEVELS: SpiceLevel[] = ['mild', 'medium', 'hot'];

/** The form's own state — strings, because that is what inputs hold. */
interface FormState {
  productName: string;
  category: string;
  description: string;
  isVeg: IsVeg;
  price: string;
  discountedPrice: string;
  spiceLevel: string;
  serves: string;
  preparationTime: string;
  isAvailable: boolean;
}

const EMPTY_FORM: FormState = {
  productName: '',
  category: '',
  description: '',
  isVeg: 'veg',
  price: '',
  discountedPrice: '',
  spiceLevel: '',
  serves: '1',
  preparationTime: '',
  isAvailable: true,
};

const formFrom = (item: MenuItem): FormState => ({
  productName: item.productName ?? '',
  category: item.category ?? '',
  description: item.description ?? '',
  isVeg: item.isVeg ?? 'veg',
  price: item.price != null ? String(item.price) : '',
  /* `null` means "no offer" and must come back as an empty box, not "0" —
     zero is a price the model refuses and a number nobody typed. */
  discountedPrice: item.discountedPrice != null ? String(item.discountedPrice) : '',
  spiceLevel: item.spiceLevel ?? '',
  serves: item.serves != null ? String(item.serves) : '1',
  preparationTime: item.preparationTime != null ? String(item.preparationTime) : '',
  isAvailable: item.isAvailable !== false,
});

/** A number the server should parse, or `undefined` to leave the field alone. */
const num = (value: string): number | undefined => {
  const text = value.trim();
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * The form as the server wants it.
 *
 * An empty offer price is sent as `null` rather than omitted, because that is
 * how an offer is REMOVED — leaving it out would mean "do not change it", and
 * an owner who cleared the box would watch the discount survive their save.
 * Everything else empty is simply not sent.
 */
const payloadFrom = (form: FormState): MenuItemInput => ({
  productName: form.productName.trim(),
  category: form.category.trim(),
  description: form.description.trim(),
  isVeg: form.isVeg,
  price: num(form.price),
  discountedPrice: form.discountedPrice.trim() ? num(form.discountedPrice) ?? null : null,
  spiceLevel: (form.spiceLevel || null) as SpiceLevel | null,
  serves: num(form.serves),
  preparationTime: form.preparationTime.trim() ? num(form.preparationTime) ?? null : null,
  isAvailable: form.isAvailable,
});

export const RestaurantMenuPage: React.FC<RestaurantMenuPageProps> = ({ search }) => {
  const menu = useFetch(() => restaurantAdminService.menu(), []);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  /* The server's joined refusal, shown at the top of the form rather than as
     a toast: it can name three problems at once and it belongs beside the
     fields it is about, not in a corner that fades after four seconds. */
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<MenuItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [flipping, setFlipping] = useState<string | null>(null);

  const items = menu.data?.items ?? [];
  const unavailable = menu.data?.unavailable ?? 0;

  /* From `menu.data`, not from the `items` array above: `?? []` is a new
     array on every render, which would re-run this on every keystroke. */
  const rows = useMemo(() => {
    const all = menu.data?.items ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((item) =>
      [item.productName, item.category, item.description, ...(item.tags ?? [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [menu.data, search]);

  /* Grouped by section, in the order the server returns — `category`,
     `displayOrder`, `createdAt`, which is the model's stated read order and
     the same order the diner's menu is drawn in. Re-sorting here would show
     an owner a different menu from the one their customers see. */
  const sections = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    rows.forEach((item) => {
      const key = item.category || 'Uncategorised';
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    });
    return [...map.entries()];
  }, [rows]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (item: MenuItem) => {
    setForm(formFrom(item));
    setFormError(null);
    setCreating(false);
    setEditing(item);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setFormError(null);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    setFormError(null);
    const payload = payloadFrom(form);
    const res = editing
      ? await restaurantAdminService.updateMenuItem(editing.productId, payload)
      : await restaurantAdminService.createMenuItem(payload);
    setSaving(false);

    if (res.success) {
      setToast({
        tone: 'good',
        message: editing ? `${form.productName} updated.` : `${form.productName} added to the menu.`,
      });
      closeForm();
      menu.reload();
      return;
    }

    /* Kept in the form, not thrown as a toast — the modal stays open, the
       typed values stay in it, and the reason sits above the fields it is
       about. */
    setFormError(res.message || 'That dish could not be saved.');
  };

  const flipAvailability = async (item: MenuItem, next: boolean) => {
    setFlipping(item.productId);
    const res = await restaurantAdminService.setMenuItemAvailability(item.productId, next);
    setFlipping(null);
    if (res.success) {
      setToast({
        tone: 'good',
        message: `${item.productName} is ${next ? 'back in stock' : 'out of stock'}.`,
      });
      menu.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'That could not be changed.' });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await restaurantAdminService.deleteMenuItem(pendingDelete.productId);
    setDeleting(false);
    if (res.success) {
      setToast({ tone: 'good', message: `${pendingDelete.productName} removed from the menu.` });
      setPendingDelete(null);
      menu.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'That dish could not be removed.' });
    }
  };

  const formOpen = creating || Boolean(editing);

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="My restaurant"
        title="Menu"
        description={
          items.length
            ? `${items.length} dish${items.length === 1 ? '' : 'es'}${
                unavailable ? ` · ${unavailable} switched off` : ''
              }`
            : 'Everything your customers can order.'
        }
        actions={
          <>
            <Button
              size="sm"
              variant="secondary"
              icon={RefreshCw}
              onClick={menu.reload}
              loading={menu.refreshing}
            >
              Refresh
            </Button>
            <Button size="sm" variant="primary" icon={Plus} onClick={openCreate}>
              Add a dish
            </Button>
          </>
        }
      />

      {menu.error && <ErrorState message={menu.error} onRetry={menu.reload} />}

      {/* A quiet line rather than a banner: it is useful to know at a glance
          and it is not a problem to be dismissed. */}
      {unavailable > 0 && !search.trim() && (
        <Box className="flex items-center gap-2 text-label text-ink-3">
          <AlertCircle className="size-3.5 text-warn shrink-0" strokeWidth={2} />
          {unavailable} dish{unavailable === 1 ? ' is' : 'es are'} switched off and not being shown
          to customers.
        </Box>
      )}

      <Card>
        <Table>
          <TableHead>
            <Tr>
              <Th>Dish</Th>
              <Th>Type</Th>
              <Th className="text-right">Price</Th>
              <Th>In stock</Th>
              <Th />
            </Tr>
          </TableHead>
          <TableBody>
            {menu.loading ? (
              <TableSkeleton rows={6} cols={5} />
            ) : rows.length === 0 ? (
              <PlainTr>
                <PlainTd colSpan={5}>
                  <EmptyState
                    icon={BookOpenText}
                    title={search.trim() ? 'Nothing matches that' : 'No dishes yet'}
                    description={
                      search.trim()
                        ? 'Clear the filter in the header to see the whole menu.'
                        : 'Add your first dish — customers see it as soon as your restaurant is approved and open.'
                    }
                    action={
                      search.trim() ? undefined : (
                        <Button variant="primary" icon={Plus} onClick={openCreate}>
                          Add a dish
                        </Button>
                      )
                    }
                  />
                </PlainTd>
              </PlainTr>
            ) : (
              sections.map(([section, dishes]) => (
                <React.Fragment key={section}>
                  <PlainTr>
                    <PlainTd
                      colSpan={5}
                      className="px-5 py-2 bg-surface-subtle border-b border-line"
                    >
                      <Text className="text-micro uppercase text-ink-3">
                        {section} · {dishes.length}
                      </Text>
                    </PlainTd>
                  </PlainTr>
                  {dishes.map((item) => {
                    const veg = VEG_LOOK[item.isVeg] ?? VEG_LOOK.veg;
                    const onOffer =
                      item.discountedPrice != null && item.discountedPrice < item.price;
                    return (
                      <Tr key={item.productId}>
                        <Td>
                          <Box className="flex items-center gap-3 min-w-0">
                            {item.productImage?.url ? (
                              <Image
                                src={item.productImage.url}
                                alt=""
                                className="size-9 rounded-control object-cover shrink-0 border border-line"
                              />
                            ) : (
                              <Inline className="grid place-items-center size-9 rounded-control bg-surface-inset text-ink-3 shrink-0">
                                <ImageOff className="size-4" strokeWidth={1.75} />
                              </Inline>
                            )}
                            <Box className="min-w-0">
                              <Text className="text-sm font-medium text-ink truncate">
                                {item.productName}
                              </Text>
                              {item.description && (
                                <Text className="text-label text-ink-3 truncate max-w-md">
                                  {item.description}
                                </Text>
                              )}
                            </Box>
                          </Box>
                        </Td>
                        <Td>
                          <Box className="flex items-center gap-1.5 flex-wrap">
                            <Badge tone={veg.tone} icon={Circle}>
                              {veg.label}
                            </Badge>
                            {item.spiceLevel && (
                              <Badge tone="neutral" icon={Flame}>
                                {item.spiceLevel}
                              </Badge>
                            )}
                          </Box>
                        </Td>
                        <Td className="text-right">
                          {onOffer ? (
                            <>
                              <Strong className="text-ink tabular">
                                {rupees(item.discountedPrice as number)}
                              </Strong>
                              <Text className="text-label text-ink-3 tabular line-through">
                                {rupees(item.price)}
                              </Text>
                            </>
                          ) : (
                            <Strong className="text-ink tabular">{rupees(item.price)}</Strong>
                          )}
                        </Td>
                        <Td>
                          <Box className="flex items-center gap-2">
                            <Switch
                              checked={item.isAvailable}
                              busy={flipping === item.productId}
                              onChange={(next) => flipAvailability(item, next)}
                              label={`${item.isAvailable ? 'Take' : 'Put'} ${item.productName} ${
                                item.isAvailable ? 'off' : 'back on'
                              } the menu`}
                            />
                            <Text className="text-label text-ink-3">
                              {item.isAvailable ? 'Yes' : 'Sold out'}
                            </Text>
                          </Box>
                        </Td>
                        <Td>
                          <Box className="flex items-center justify-end gap-0.5">
                            <IconButton
                              icon={Pencil}
                              label={`Edit ${item.productName}`}
                              onClick={() => openEdit(item)}
                            />
                            <IconButton
                              icon={Trash2}
                              label={`Remove ${item.productName}`}
                              tone="danger"
                              onClick={() => setPendingDelete(item)}
                            />
                          </Box>
                        </Td>
                      </Tr>
                    );
                  })}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ── Add / edit ─────────────────────────────────────────────────── */}
      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? `Edit ${editing.productName}` : 'Add a dish'}
        description={
          editing
            ? 'Changes show on the customer menu straight away.'
            : 'A name, a section and a price are all it takes to start.'
        }
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={save}>
              {editing ? 'Save changes' : 'Add to menu'}
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

          <Box className="grid sm:grid-cols-2 gap-4">
            <Field label="Dish name" required>
              <Input
                value={form.productName}
                onChange={(e) => set('productName', e.target.value)}
                placeholder="Paneer Butter Masala"
              />
            </Field>
            <Field
              label="Section"
              required
              hint="Starters, Main Course, Beverages…"
            >
              <Input
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                placeholder="Main Course"
              />
            </Field>
          </Box>

          <Field label="Description">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Cottage cheese in a rich tomato and butter gravy."
            />
          </Field>

          <Box className="grid sm:grid-cols-3 gap-4">
            <Field label="Price (₹)" required>
              <Input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                placeholder="220"
              />
            </Field>
            <Field
              label="Offer price (₹)"
              hint="Leave blank for no offer"
            >
              <Input
                type="number"
                min={0}
                value={form.discountedPrice}
                onChange={(e) => set('discountedPrice', e.target.value)}
                placeholder="—"
              />
            </Field>
            <Field label="Food type">
              <Select
                value={form.isVeg}
                onChange={(e) => set('isVeg', e.target.value as IsVeg)}
              >
                {(Object.keys(VEG_LOOK) as IsVeg[]).map((value) => (
                  <Option key={value} value={value}>
                    {VEG_LOOK[value].label}
                  </Option>
                ))}
              </Select>
            </Field>
          </Box>

          <Box className="grid sm:grid-cols-3 gap-4">
            <Field label="Spice level">
              <Select
                value={form.spiceLevel}
                onChange={(e) => set('spiceLevel', e.target.value)}
              >
                {/* Empty is a real answer — a dessert is not mild. */}
                <Option value="">Not applicable</Option>
                {SPICE_LEVELS.map((level) => (
                  <Option key={level} value={level}>
                    {level}
                  </Option>
                ))}
              </Select>
            </Field>
            <Field label="Serves">
              <Input
                type="number"
                min={1}
                value={form.serves}
                onChange={(e) => set('serves', e.target.value)}
              />
            </Field>
            <Field label="Prep time (min)">
              <Input
                type="number"
                min={0}
                value={form.preparationTime}
                onChange={(e) => set('preparationTime', e.target.value)}
                placeholder="—"
              />
            </Field>
          </Box>

          <Box className="flex items-center gap-2.5 pt-1">
            <Switch
              checked={form.isAvailable}
              onChange={(next) => set('isAvailable', next)}
              label="Available to order"
            />
            <Text className="text-sm text-ink-2">
              {form.isAvailable ? 'Available to order' : 'Hidden from customers until switched on'}
            </Text>
          </Box>

          {editing?.productImage?.url && (
            <Box className="flex items-center gap-3 pt-1">
              <Image
                src={editing.productImage.url}
                alt=""
                className="size-12 rounded-control object-cover border border-line"
              />
              <Text className="text-label text-ink-3">
                Photographs are managed in the Food Partner app.
              </Text>
            </Box>
          )}
        </Box>
      </Modal>

      {/* ── Remove ─────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={`Remove ${pendingDelete?.productName ?? ''}?`}
        description="This takes the dish off the menu for good, with its photographs, portions and add-ons. To hide it for tonight only, switch it out of stock instead."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button variant="danger" icon={Trash2} loading={deleting} onClick={confirmDelete}>
              Remove for good
            </Button>
          </>
        }
      >
        <Box className="flex items-start gap-2.5 p-3 rounded-panel bg-warn-soft border border-warn-border">
          <XCircle className="size-4 text-warn shrink-0 mt-0.5" strokeWidth={2} />
          <Text className="text-sm text-ink-2">
            Orders already placed for this dish are not affected — they keep the name and the price
            they were ordered at.
          </Text>
        </Box>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
