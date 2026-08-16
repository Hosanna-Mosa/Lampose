import React, { useState } from 'react';
import {
  CheckCircle2,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Server,
  Sun,
  UserRound,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataRow,
  Field,
  Input,
  PageHeader,
  Toast,
  cx,
  type ToastState,
} from '../components/ui';
import { Avatar } from '../components/layout/Avatar';
import { API_BASE_URL } from '../api/axiosInstance';
import { insightsService } from '../api/services/insightsService';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { duration, formatDateTime } from '../lib/format';
import type { HealthEntity } from '../api/types';

export const SettingsPage: React.FC = () => {
  const { user, logout, token } = useAuth();
  const { theme, setTheme } = useTheme();

  const [toast, setToast] = useState<ToastState | null>(null);

  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; health: HealthEntity | null; message: string } | null>(
    null
  );

  const handleTest = async () => {
    setTesting(true);
    const res = await insightsService.getHealth();
    setTesting(false);
    setProbe({
      ok: res.success && res.data?.database?.connected === true,
      health: res.data,
      message: res.success ? 'Connected' : res.message || 'Unreachable',
    });
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        eyebrow="Platform"
        title="Settings"
        description="Your account, the console's appearance, and the API endpoint this browser talks to."
      />

      {/* Account */}
      <Card>
        <CardHeader title="Account" description="The administrator record you signed in with" icon={UserRound} />
        <div className="mt-4 flex items-center gap-3.5 pb-4 border-b border-line">
          <Avatar name={user?.name} src={user?.avatar} size={44} />
          <div className="min-w-0">
            <p className="text-body font-medium text-ink truncate">{user?.name}</p>
            <p className="text-sm text-ink-3 truncate">{user?.email}</p>
          </div>
          <Badge tone="brand" className="ml-auto">
            {user?.role}
          </Badge>
        </div>

        <div className="mt-1">
          <DataRow label="Account status" value={user?.status ?? '—'} />
          <DataRow label="Created" value={formatDateTime(user?.createdAt)} />
          <DataRow label="Last sign-in" value={user?.lastLogin ?? '—'} />
          <DataRow
            label="Session token"
            value={token ? `${token.slice(0, 12)}… (${token.length} chars)` : 'None'}
            mono
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="danger" icon={LogOut} onClick={logout}>
            Sign out
          </Button>
        </div>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader title="Appearance" description="Applies to this browser only" icon={Palette} />
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {([
            ['light', Sun, 'Light'],
            ['dark', Moon, 'Dark'],
          ] as const).map(([value, Icon, label]) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
              className={cx(
                'flex items-center gap-2.5 p-3 rounded-panel border transition-colors text-left',
                theme === value
                  ? 'border-brand bg-brand-soft text-brand-ink'
                  : 'border-line hover:bg-surface-inset text-ink-2'
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.75} />
              <span className="text-body font-medium">{label}</span>
              {theme === value && <CheckCircle2 className="size-4 ml-auto shrink-0" strokeWidth={2} />}
            </button>
          ))}

          <button
            onClick={() => {
              localStorage.removeItem('admin_theme');
              setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
              setToast({ tone: 'good', message: 'Following your system theme.' });
            }}
            className="flex items-center gap-2.5 p-3 rounded-panel border border-line hover:bg-surface-inset text-ink-2 transition-colors text-left"
          >
            <Monitor className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="text-body font-medium">Match system</span>
          </button>
        </div>
      </Card>

      {/* API endpoint */}
      <Card>
        <CardHeader
          title="API endpoint"
          description="Where this console sends every request (configured via environment variable)"
          icon={Server}
          action={<Badge tone="neutral">Environment (.env)</Badge>}
        />

        <div className="mt-4 space-y-4">
          <Field
            label="Base URL"
            hint="Set via VITE_API_BASE_URL in .env"
          >
            <Input
              value={API_BASE_URL}
              readOnly
              disabled
              className="font-mono bg-surface-inset cursor-not-allowed opacity-85"
            />
          </Field>

          {probe && (
            <div
              className={cx(
                'flex items-start gap-2.5 p-3 rounded-panel border',
                probe.ok ? 'bg-good-soft border-good-border' : 'bg-crit-soft border-crit-border'
              )}
            >
              {probe.ok ? (
                <CheckCircle2 className="size-4 text-good shrink-0 mt-0.5" strokeWidth={2} />
              ) : (
                <XCircle className="size-4 text-crit shrink-0 mt-0.5" strokeWidth={2} />
              )}
              <div className="text-sm min-w-0">
                <p className="text-ink font-medium">{probe.message}</p>
                {probe.health && (
                  <p className="text-ink-2 mt-0.5 break-words">
                    Database {probe.health.database.state}
                    {probe.health.database.name && ` · ${probe.health.database.name}`}
                    {probe.health.latencyMs !== undefined && ` · ${probe.health.latencyMs}ms`}
                    {' · up '}
                    {duration(probe.health.uptimeSeconds)}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" loading={testing} onClick={handleTest}>
              Test connection
            </Button>
          </div>
        </div>
      </Card>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
