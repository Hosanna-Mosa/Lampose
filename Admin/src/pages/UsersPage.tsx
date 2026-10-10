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
import { FilterBar } from '../components/common/molecules/FilterBar';
import { FilterChips } from '../components/common/molecules/FilterChips';
import { ResultCount } from '../components/common/molecules/ResultCount';
import { filterBySearch, filterSelectClass } from '../components/common/utils';

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

  /* The whole admins collection in one request — it is a handful of rows and
     the route does not paginate — so role and status filter what is already
     loaded and every chip can say how many accounts it would show. */
  const { data, loading, error, refreshing, reload } = useFetch(() => userService.getUsers(), []);

  const searched = useMemo(
    () =>
      filterBySearch(data?.items ?? [], search, (u, q) =>
        `${u.name} ${u.email} ${u.role} ${u.status}`.toLowerCase().includes(q)
      ),
    [data, search]
  );

  const users = useMemo(
    () => searched.filter((u) => (role === 'All' || u.role === role) && (status === 'All' || u.status === status)),
    [searched, role, status]
  );

  /* Each dimension is counted with search and the OTHER filter applied, so
     "Inactive 2" means two accounts would show if that chip were picked. */
  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    const byRole: Record<string, number> = {};
    let statusAll = 0;
    let roleAll = 0;
    for (const u of searched) {
      if (role === 'All' || u.role === role) {
        statusAll += 1;
        byStatus[u.status] = (byStatus[u.status] ?? 0) + 1;
      }
      if (status === 'All' || u.status === status) {
        roleAll += 1;
        byRole[u.role] = (byRole[u.role] ?? 0) + 1;
      }
    }
    return { byStatus, byRole, statusAll, roleAll };
  }, [searched, role, status]);

  const total = data?.items.length ?? 0;
  const filtered = !!search.trim() || role !== 'All' || status !== 'All';
  const clearFilters = () => {
    setRole('All');
    setStatus('All');
  };

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
        <FilterBar
          summary={
            loading ? undefined : (
              <ResultCount
                shown={users.length}
                total={total}
                noun="accounts"
                filtered={filtered}
                onClear={role !== 'All' || status !== 'All' ? clearFilters : undefined}
              />
            )
          }
        >
          <FilterChips
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { id: 'All', label: 'All', count: loading ? null : counts.statusAll },
              ...ADMIN_STATUSES.map((s) => ({
                id: s,
                label: s,
                count: loading ? null : (counts.byStatus[s] ?? 0),
                tone: adminStatusMeta(s).tone,
              })),
            ]}
          />

          <Select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={filterSelectClass}
            aria-label="Role"
          >
            <Option value="All">All roles{loading ? '' : ` (${counts.roleAll})`}</Option>
            {ADMIN_ROLES.map((r) => (
              <Option key={r} value={r}>
                {r}
                {loading ? '' : ` (${counts.byRole[r] ?? 0})`}
              </Option>
            ))}
          </Select>
        </FilterBar>
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
                      title={filtered ? 'No administrators match these filters' : 'No administrators'}
                      description={
                        filtered
                          ? 'Try a different search, role or status.'
                          : 'Create the first administrator account to grant console access.'
                      }
                      action={
                        role !== 'All' || status !== 'All' ? (
                          <Button variant="secondary" icon={X} onClick={clearFilters}>
                            Clear filters
                          </Button>
                        ) : undefined
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
