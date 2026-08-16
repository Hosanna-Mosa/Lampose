import React, { useMemo, useState } from 'react';
import { CheckCircle2, Package, Pencil, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Switch,
  Table,
  TableSkeleton,
  Td,
  Th,
  Toast,
  Tr,
  type ToastState,
} from '../components/ui';
import { productService } from '../api/services/productService';
import { useFetch } from '../lib/useFetch';
import { rupees } from '../lib/format';
import type { ProductEntity } from '../api/types';

interface ProductsPageProps {
  search: string;
}

interface ProductForm {
  name: string;
  description: string;
  price: string;
  inStock: boolean;
}

const EMPTY_FORM: ProductForm = { name: '', description: '', price: '0', inStock: true };

const toForm = (p: ProductEntity): ProductForm => ({
  name: p.name,
  description: p.description,
  price: String(p.price),
  inStock: p.inStock,
});

export const ProductsPage: React.FC<ProductsPageProps> = ({ search }) => {
  const [toast, setToast] = useState<ToastState | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ProductEntity | null>(null);
  const [editForm, setEditForm] = useState<ProductForm | null>(null);

  const [pendingDelete, setPendingDelete] = useState<ProductEntity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, error, refreshing, reload } = useFetch(() => productService.getProducts(), []);

  const products = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(q));
  }, [data, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const res = await productService.createProduct({
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price) || 0,
      inStock: form.inStock,
    });
    setSaving(false);

    if (res.success) {
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setToast({ tone: 'good', message: `"${form.name}" created.` });
      reload();
    } else {
      setFormError(res.message || 'Could not create the product.');
    }
  };

  const openEdit = (p: ProductEntity) => {
    setEditing(p);
    setEditForm(toForm(p));
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editForm) return;
    setSaving(true);

    const res = await productService.updateProduct(editing.id, {
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      price: Number(editForm.price) || 0,
      inStock: editForm.inStock,
    });
    setSaving(false);

    if (res.success) {
      setToast({ tone: 'good', message: `"${editForm.name}" updated.` });
      setEditing(null);
      setEditForm(null);
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Update failed.' });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await productService.deleteProduct(pendingDelete.id);
    setDeleting(false);

    if (res.success) {
      setToast({ tone: 'good', message: 'Product deleted.' });
      setPendingDelete(null);
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Delete failed.' });
      setPendingDelete(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Database"
        title="Products"
        description="The products collection — carried over from the leads-backend merge with nothing else routing to it."
        actions={
          <>
            <IconButton icon={RefreshCw} label="Reload products" onClick={reload} spinning={refreshing || loading} />
            <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
              Add product
            </Button>
          </>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <Card padded={false}>
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Price</Th>
                <Th>Availability</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={4} />
              ) : !products.length ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={Package}
                      title={search ? 'No matching products' : 'No products yet'}
                      description={search ? 'Try a different search.' : 'Create the first product record.'}
                    />
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <p className="text-sm font-medium text-ink truncate">{p.name}</p>
                      {p.description && <p className="text-label text-ink-3 truncate max-w-md">{p.description}</p>}
                    </Td>
                    <Td className="tabular">{rupees(p.price)}</Td>
                    <Td>
                      <Badge tone={p.inStock ? 'good' : 'neutral'} icon={p.inStock ? CheckCircle2 : XCircle}>
                        {p.inStock ? 'In stock' : 'Out of stock'}
                      </Badge>
                    </Td>
                    <Td>
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
                ))
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add product"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" form="create-product" type="submit" loading={saving}>
              Create product
            </Button>
          </>
        }
      >
        <form id="create-product" onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <p className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
              {formError}
            </p>
          )}
          <Field label="Name" required>
            <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Description">
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <Field label="Price (₹)">
            <Input type="number" min={0} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-label text-ink-2">In stock</span>
            <Switch checked={form.inStock} onChange={(v) => setForm((f) => ({ ...f, inStock: v }))} label="In stock" />
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
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" form="edit-product" type="submit" loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        {editForm && (
          <form id="edit-product" onSubmit={handleUpdate} className="space-y-4">
            <Field label="Name">
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => f && { ...f, name: e.target.value })} />
            </Field>
            <Field label="Description">
              <Input value={editForm.description} onChange={(e) => setEditForm((f) => f && { ...f, description: e.target.value })} />
            </Field>
            <Field label="Price (₹)">
              <Input
                type="number"
                min={0}
                value={editForm.price}
                onChange={(e) => setEditForm((f) => f && { ...f, price: e.target.value })}
              />
            </Field>
            <div className="flex items-center justify-between">
              <span className="text-label text-ink-2">In stock</span>
              <Switch
                checked={editForm.inStock}
                onChange={(v) => setEditForm((f) => f && { ...f, inStock: v })}
                label="In stock"
              />
            </div>
          </form>
        )}
      </Modal>

      {/* Delete */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete product"
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
          <span className="text-ink font-medium">{pendingDelete?.name}</span> will be removed. This cannot be undone.
        </p>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
