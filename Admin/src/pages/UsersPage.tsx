import React, { useMemo, useState } from 'react';
import { Plus, RefreshCw, Shield, Trash2, UserCog, Users, X } from 'lucide-react';
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
import { userService } from '../api/services/userService';
import { useFetch } from '../lib/useFetch';
import { ADMIN_ROLES, ADMIN_STATUSES, adminStatusMeta } from '../lib/domain';
import { formatDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import type { AdminRole, AdminStatus, UserEntity } from '../api/types';

interface UsersPageProps {
  search: string;
}

const EMPTY_FORM: { name: string; email: string; password: string; role: AdminRole; status: AdminStatus } = {
  name: '',
  email: '',
  password: '',
  role: 'Admin',
  status: 'Active',
};

export const UsersPage: React.FC<UsersPageProps> = ({ search }) => {
  const { user: currentUser } = useAuth();
  const [status, setStatus] = useState('All');
  const [role, setRole] = useState('All');
  const [toast, setToast] = useState<ToastState | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<UserEntity | null>(null);
  const [editRole, setEditRole] = useState<AdminRole>('Admin');
  const [editStatus, setEditStatus] = useState<AdminStatus>('Active');

  const [pendingDelete, setPendingDelete] = useState<UserEntity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, error, refreshing, reload } = useFetch(
    () =>
      userService.getUsers({
        ...(status !== 'All' && { status }),
        ...(role !== 'All' && { role }),
      }),
    [status, role]
  );

  const users = useMemo(() => {
    const list = data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q));
  }, [data, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const res = await userService.createUser({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      status: form.status,
      ...(form.password && { password: form.password }),
    });

    setSaving(false);

    if (res.success) {
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setToast({ tone: 'good', message: `${res.data.name} can now sign in to the console.` });
      reload();
    } else {
      setFormError(res.message || 'Could not create the administrator.');
    }
  };

  const openEdit = (u: UserEntity) => {
    setEditing(u);
    setEditRole(u.role);
    setEditStatus(u.status);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);

    const res = await userService.updateUser(editing.id, { role: editRole, status: editStatus });
    setSaving(false);

    if (res.success) {
      setToast({ tone: 'good', message: `${editing.name} updated.` });
      setEditing(null);
      reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'Update failed.' });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await userService.deleteUser(pendingDelete.id);
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
        eyebrow="Records"
        title="Administrators"
        description="Accounts with access to this console, stored in the admins collection."
        actions={
          <>
            <IconButton
              icon={RefreshCw}
              label="Reload administrators"
              onClick={reload}
              spinning={refreshing || loading}
            />
            <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
              Add administrator
            </Button>
          </>
        }
      />

      <Card padded={false} className="p-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-auto min-w-36">
            <option value="All">All roles</option>
            {ADMIN_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>

          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-36">
            <option value="All">All statuses</option>
            {ADMIN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>

          {(role !== 'All' || status !== 'All') && (
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              onClick={() => {
                setRole('All');
                setStatus('All');
              }}
            >
              Clear
            </Button>
          )}

          <span className="text-label text-ink-3 ml-auto tabular">
            {loading ? 'Loading…' : `${users.length} account${users.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </Card>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <Card padded={false}>
          <Table>
            <thead>
              <tr>
                <Th>Administrator</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th>Last sign-in</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : !users.length ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Users}
                      title={search || role !== 'All' || status !== 'All' ? 'No matching accounts' : 'No administrators'}
                      description={
                        search || role !== 'All' || status !== 'All'
                          ? 'Try clearing the filters above.'
                          : 'Create the first administrator account to grant console access.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const meta = adminStatusMeta(u.status);
                  const isSelf = currentUser?.email === u.email;
                  return (
                    <Tr key={u.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} src={u.avatar} size={32} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink truncate flex items-center gap-1.5">
                              {u.name}
                              {isSelf && (
                                <span className="text-label text-ink-3 font-normal">(you)</span>
                              )}
                            </p>
                            <p className="text-label text-ink-3 truncate">{u.email}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <Badge tone={u.role === 'Super Admin' ? 'brand' : 'neutral'} icon={Shield}>
                          {u.role}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={meta.tone} icon={meta.icon}>
                          {u.status}
                        </Badge>
                      </Td>
                      <Td className="tabular">{formatDate(u.createdAt)}</Td>
                      <Td>{u.lastLogin}</Td>
                      <Td>
                        <div className="flex items-center justify-end gap-0.5">
                          <IconButton icon={UserCog} label={`Edit ${u.name}`} onClick={() => openEdit(u)} />
                          <IconButton
                            icon={Trash2}
                            label={isSelf ? 'You cannot delete your own account' : `Delete ${u.name}`}
                            tone="danger"
                            disabled={isSelf}
                            className={isSelf ? 'opacity-35 pointer-events-none' : undefined}
                            onClick={() => setPendingDelete(u)}
                          />
                        </div>
                      </Td>
                    </Tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add administrator"
        description="Creates an account in the admins collection with console access."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" form="create-admin" type="submit" loading={saving}>
              Create account
            </Button>
          </>
        }
      >
        <form id="create-admin" onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <p className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
              {formError}
            </p>
          )}

          <Field label="Full name" required>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>

          <Field label="Email address" required>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@lampose.in"
            />
          </Field>

          <Field
            label="Temporary password"
            hint="Leave blank to use the server default. The account holder should change it after first sign-in."
          >
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              minLength={6}
              autoComplete="new-password"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Role" required>
              <Select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole }))}
              >
                {ADMIN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AdminStatus }))}
              >
                {ADMIN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </form>
      </Modal>

      {/* Edit */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name ?? ''}`}
        description={editing?.email}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" form="edit-admin" type="submit" loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        <form id="edit-admin" onSubmit={handleUpdate} className="space-y-4">
          <Field label="Role">
            <Select value={editRole} onChange={(e) => setEditRole(e.target.value as AdminRole)}>
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value as AdminStatus)}>
              {ADMIN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>

      {/* Delete */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Remove administrator"
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
          <span className="text-ink font-medium">{pendingDelete?.name}</span> ({pendingDelete?.email}) will
          lose access to the console immediately. This cannot be undone.
        </p>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
