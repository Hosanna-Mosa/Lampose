import React, { useMemo, useState } from 'react';
import { Plus, RefreshCw, Shield, Trash2, UserCog, Users, X } from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { IconButton } from '../components/common/atoms/IconButton';
import { Input } from '../components/common/atoms/Input';
import { Select } from '../components/common/atoms/Select';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { Avatar } from '../components/common/atoms/Avatar';
import { userService } from '../api/services/userService';
import { useFetch } from '../lib/useFetch';
import { ADMIN_ROLES, ADMIN_STATUSES, adminStatusMeta } from '../lib/domain';
import { formatDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import type { AdminRole, AdminStatus, UserEntity } from '../api/types';
import { Box } from '../components/common/atoms/Box';
import { Form } from '../components/common/atoms/Form';
import { Inline } from '../components/common/atoms/Inline';
import { Option } from '../components/common/atoms/Option';
import { PlainTd, PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Text } from '../components/common/atoms/Text';
import { filterBySearch } from '../components/common/utils';

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

  const users = useMemo(
    () => filterBySearch(data?.items ?? [], search, (u, q) => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q)),
    [data, search]
  );

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
    <Box className="space-y-5">
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
        <Box className="flex flex-wrap items-center gap-2.5">
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-auto min-w-36">
            <Option value="All">All roles</Option>
            {ADMIN_ROLES.map((r) => (
              <Option key={r} value={r}>
                {r}
              </Option>
            ))}
          </Select>

          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-36">
            <Option value="All">All statuses</Option>
            {ADMIN_STATUSES.map((s) => (
              <Option key={s} value={s}>
                {s}
              </Option>
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

          <Inline className="text-label text-ink-3 ml-auto tabular">
            {loading ? 'Loading…' : `${users.length} account${users.length === 1 ? '' : 's'}`}
          </Inline>
        </Box>
      </Card>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <Card padded={false}>
          <Table>
            <TableHead>
              <PlainTr>
                <Th>Administrator</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th>Last sign-in</Th>
                <Th />
              </PlainTr>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : !users.length ? (
                <PlainTr>
                  <PlainTd colSpan={6}>
                    <EmptyState
                      icon={Users}
                      title={search || role !== 'All' || status !== 'All' ? 'No matching accounts' : 'No administrators'}
                      description={
                        search || role !== 'All' || status !== 'All'
                          ? 'Try clearing the filters above.'
                          : 'Create the first administrator account to grant console access.'
                      }
                    />
                  </PlainTd>
                </PlainTr>
              ) : (
                users.map((u) => {
                  const meta = adminStatusMeta(u.status);
                  const isSelf = currentUser?.email === u.email;
                  return (
                    <Tr key={u.id}>
                      <Td>
                        <Box className="flex items-center gap-3">
                          <Avatar name={u.name} src={u.avatar} size={32} />
                          <Box className="min-w-0">
                            <Text className="text-sm font-medium text-ink truncate flex items-center gap-1.5">
                              {u.name}
                              {isSelf && (
                                <Inline className="text-label text-ink-3 font-normal">(you)</Inline>
                              )}
                            </Text>
                            <Text className="text-label text-ink-3 truncate">{u.email}</Text>
                          </Box>
                        </Box>
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
                        <Box className="flex items-center justify-end gap-0.5">
                          <IconButton icon={UserCog} label={`Edit ${u.name}`} onClick={() => openEdit(u)} />
                          <IconButton
                            icon={Trash2}
                            label={isSelf ? 'You cannot delete your own account' : `Delete ${u.name}`}
                            tone="danger"
                            disabled={isSelf}
                            className={isSelf ? 'opacity-35 pointer-events-none' : undefined}
                            onClick={() => setPendingDelete(u)}
                          />
                        </Box>
                      </Td>
                    </Tr>
                  );
                })
              )}
            </TableBody>
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
        <Form id="create-admin" onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <Text className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
              {formError}
            </Text>
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

          <Box className="grid grid-cols-2 gap-3">
            <Field label="Role" required>
              <Select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole }))}
              >
                {ADMIN_ROLES.map((r) => (
                  <Option key={r} value={r}>
                    {r}
                  </Option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AdminStatus }))}
              >
                {ADMIN_STATUSES.map((s) => (
                  <Option key={s} value={s}>
                    {s}
                  </Option>
                ))}
              </Select>
            </Field>
          </Box>
        </Form>
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
        <Form id="edit-admin" onSubmit={handleUpdate} className="space-y-4">
          <Field label="Role">
            <Select value={editRole} onChange={(e) => setEditRole(e.target.value as AdminRole)}>
              {ADMIN_ROLES.map((r) => (
                <Option key={r} value={r}>
                  {r}
                </Option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value as AdminStatus)}>
              {ADMIN_STATUSES.map((s) => (
                <Option key={s} value={s}>
                  {s}
                </Option>
              ))}
            </Select>
          </Field>
        </Form>
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
        <Text className="text-body text-ink-2">
          <Inline className="text-ink font-medium">{pendingDelete?.name}</Inline> ({pendingDelete?.email}) will
          lose access to the console immediately. This cannot be undone.
        </Text>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
