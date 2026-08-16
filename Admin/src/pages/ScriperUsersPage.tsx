import React, { useMemo, useState } from 'react';
import { Plus, RefreshCw, Shield, Trash2, UserCog, Users } from 'lucide-react';
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
  Select,
  Table,
  TableSkeleton,
  Td,
  Th,
  Toast,
  Tr,
  type ToastState,
} from '../components/ui';
import { Avatar } from '../components/layout/Avatar';
import { scriperUserService } from '../api/services/scriperUserService';
import { useFetch } from '../lib/useFetch';
import { formatDate } from '../lib/format';
import type { ScriperUserEntity, ScriperUserRole } from '../api/types';

interface ScriperUsersPageProps {
  search: string;
}

const EMPTY_FORM: { name: string; email: string; password: string; role: ScriperUserRole } = {
  name: '',
  email: '',
  password: '',
  role: 'EMPLOYEE',
};

export const ScriperUsersPage: React.FC<ScriperUsersPageProps> = ({ search }) => {
  const [toast, setToast] = useState<ToastState | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ScriperUserEntity | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<ScriperUserRole>('EMPLOYEE');
  const [editPassword, setEditPassword] = useState('');

  const [pendingDelete, setPendingDelete] = useState<ScriperUserEntity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, error, refreshing, reload } = useFetch(() => scriperUserService.getScriperUsers(), []);

  const users = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q));
  }, [data, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const res = await scriperUserService.createScriperUser({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      ...(form.password && { password: form.password }),
    });

    setSaving(false);

    if (res.success && res.data) {
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setToast({ tone: 'good', message: `${res.data.name} added to the leads panel team.` });
      reload();
    } else {
      setFormError(res.message || 'Could not create the account.');
    }
  };

  const openEdit = (u: ScriperUserEntity) => {
    setEditing(u);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditRole(u.role);
    setEditPassword('');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);

    const res = await scriperUserService.updateScriperUser(editing.id, {
      name: editName.trim(),
      email: editEmail.trim().toLowerCase(),
      role: editRole,
      ...(editPassword && { password: editPassword }),
    });
    setSaving(false);

    if (res.success) {
      setToast({ tone: 'good', message: `${editName} updated.` });
      setEditing(null);
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Update failed.' });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await scriperUserService.deleteScriperUser(pendingDelete.id);
    setDeleting(false);

    if (res.success) {
      setToast({ tone: 'good', message: `${pendingDelete.name} removed.` });
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
        title="Leads Panel Team"
        description="Accounts in the scriper_users collection — a separate login system from this console, for the leads panel at leads.lampose.com."
        actions={
          <>
            <IconButton icon={RefreshCw} label="Reload accounts" onClick={reload} spinning={refreshing || loading} />
            <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
              Add account
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
                <Th>Account</Th>
                <Th>Role</Th>
                <Th>Created</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={4} />
              ) : !users.length ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={Users}
                      title={search ? 'No matching accounts' : 'No leads-panel accounts'}
                      description={
                        search ? 'Try a different search.' : 'Create the first account to grant leads-panel access.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} src={u.avatar} size={32} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink truncate">{u.name}</p>
                          <p className="text-label text-ink-3 truncate">{u.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={u.role === 'ADMIN' ? 'brand' : 'neutral'} icon={Shield}>
                        {u.role === 'ADMIN' ? 'Admin' : 'Employee'}
                      </Badge>
                    </Td>
                    <Td className="tabular">{formatDate(u.createdAt)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-0.5">
                        <IconButton icon={UserCog} label={`Edit ${u.name}`} onClick={() => openEdit(u)} />
                        <IconButton
                          icon={Trash2}
                          label={`Delete ${u.name}`}
                          tone="danger"
                          onClick={() => setPendingDelete(u)}
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
        title="Add leads-panel account"
        description="Creates an account in the scriper_users collection."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" form="create-scriper-user" type="submit" loading={saving}>
              Create account
            </Button>
          </>
        }
      >
        <form id="create-scriper-user" onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <p className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
              {formError}
            </p>
          )}

          <Field label="Full name" required>
            <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>

          <Field label="Email address" required>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>

          <Field label="Temporary password" hint="Leave blank to use the server default (employee123).">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              minLength={6}
              autoComplete="new-password"
            />
          </Field>

          <Field label="Role" required>
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as ScriperUserRole }))}>
              <option value="EMPLOYEE">Employee</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </Field>
        </form>
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
            <Button variant="primary" form="edit-scriper-user" type="submit" loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        <form id="edit-scriper-user" onSubmit={handleUpdate} className="space-y-4">
          <Field label="Full name">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </Field>
          <Field label="Email address">
            <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
          </Field>
          <Field label="Role">
            <Select value={editRole} onChange={(e) => setEditRole(e.target.value as ScriperUserRole)}>
              <option value="EMPLOYEE">Employee</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </Field>
          <Field label="Reset password" hint="Leave blank to keep the current password.">
            <Input
              type="password"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              minLength={6}
              autoComplete="new-password"
            />
          </Field>
        </form>
      </Modal>

      {/* Delete */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Remove account"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} loading={deleting} onClick={handleDelete}>
              Remove account
            </Button>
          </>
        }
      >
        <p className="text-body text-ink-2">
          <span className="text-ink font-medium">{pendingDelete?.name}</span> ({pendingDelete?.email}) will lose
          access to the leads panel immediately. This cannot be undone.
        </p>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
