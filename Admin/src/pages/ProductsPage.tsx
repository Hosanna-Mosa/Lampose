import React, { useMemo, useState } from 'react';
import { CheckCircle2, Package, Pencil, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { IconButton } from '../components/common/atoms/IconButton';
import { Input } from '../components/common/atoms/Input';
import { Switch } from '../components/common/atoms/Switch';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { productService } from '../api/services/productService';
import { useFetch } from '../lib/useFetch';
import { rupees } from '../lib/format';
import type { ProductEntity } from '../api/types';
import { Box } from '../components/common/atoms/Box';
import { Form } from '../components/common/atoms/Form';
import { Inline } from '../components/common/atoms/Inline';
import { PlainTd, PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Text } from '../components/common/atoms/Text';
import { filterBySearch } from '../components/common/utils';

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

  const products = useMemo(
    () => filterBySearch(data ?? [], search, (p, q) => `${p.name} ${p.description}`.toLowerCase().includes(q)),
    [data, search]
  );

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
    <Box className="space-y-5">
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
            <TableHead>
              <PlainTr>
                <Th>Product</Th>
                <Th>Price</Th>
                <Th>Availability</Th>
                <Th />
              </PlainTr>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableSkeleton cols={4} />
              ) : !products.length ? (
                <PlainTr>
                  <PlainTd colSpan={4}>
                    <EmptyState
                      icon={Package}
                      title={search ? 'No matching products' : 'No products yet'}
                      description={search ? 'Try a different search.' : 'Create the first product record.'}
                    />
                  </PlainTd>
                </PlainTr>
              ) : (
                products.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <Text className="text-sm font-medium text-ink truncate">{p.name}</Text>
                      {p.description && <Text className="text-label text-ink-3 truncate max-w-md">{p.description}</Text>}
                    </Td>
                    <Td className="tabular">{rupees(p.price)}</Td>
                    <Td>
                      <Badge tone={p.inStock ? 'good' : 'neutral'} icon={p.inStock ? CheckCircle2 : XCircle}>
                        {p.inStock ? 'In stock' : 'Out of stock'}
                      </Badge>
                    </Td>
                    <Td>
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
                ))
              )}
            </TableBody>
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
        <Form id="create-product" onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <Text className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
              {formError}
            </Text>
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
          <Box className="flex items-center justify-between">
            <Inline className="text-label text-ink-2">In stock</Inline>
            <Switch checked={form.inStock} onChange={(v) => setForm((f) => ({ ...f, inStock: v }))} label="In stock" />
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
          <Form id="edit-product" onSubmit={handleUpdate} className="space-y-4">
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
            <Box className="flex items-center justify-between">
              <Inline className="text-label text-ink-2">In stock</Inline>
              <Switch
                checked={editForm.inStock}
                onChange={(v) => setEditForm((f) => f && { ...f, inStock: v })}
                label="In stock"
              />
            </Box>
          </Form>
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
        <Text className="text-body text-ink-2">
          <Inline className="text-ink font-medium">{pendingDelete?.name}</Inline> will be removed. This cannot be undone.
        </Text>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
