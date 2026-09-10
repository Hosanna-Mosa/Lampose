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
import { Badge } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { Input } from '../components/common/atoms/Input';
import { CardHeader } from '../components/common/molecules/CardHeader';
import { DataRow } from '../components/common/molecules/DataRow';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { cx } from '../components/common/utils';
import { Avatar } from '../components/common/atoms/Avatar';
import { API_BASE_URL } from '../api/axiosInstance';
import { insightsService } from '../api/services/insightsService';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { duration, formatDateTime } from '../lib/format';
import type { HealthEntity } from '../api/types';
import { Box } from '../components/common/atoms/Box';
import { Inline } from '../components/common/atoms/Inline';
import { PlainButton } from '../components/common/atoms/PlainButton';
import { Text } from '../components/common/atoms/Text';

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
    <Box className="space-y-5 max-w-3xl">
      <PageHeader
        eyebrow="Platform"
        title="Settings"
        description="Your account, the console's appearance, and the API endpoint this browser talks to."
      />

      {/* Account */}
      <Card>
        <CardHeader title="Account" description="The administrator record you signed in with" icon={UserRound} />
        <Box className="mt-4 flex items-center gap-3.5 pb-4 border-b border-line">
          <Avatar name={user?.name} src={user?.avatar} size={44} />
          <Box className="min-w-0">
            <Text className="text-body font-medium text-ink truncate">{user?.name}</Text>
            <Text className="text-sm text-ink-3 truncate">{user?.email}</Text>
          </Box>
          <Badge tone="brand" className="ml-auto">
            {user?.role}
          </Badge>
        </Box>

        <Box className="mt-1">
          <DataRow label="Account status" value={user?.status ?? '—'} />
          <DataRow label="Created" value={formatDateTime(user?.createdAt)} />
          <DataRow label="Last sign-in" value={user?.lastLogin ?? '—'} />
          <DataRow
            label="Session token"
            value={token ? `${token.slice(0, 12)}… (${token.length} chars)` : 'None'}
            mono
          />
        </Box>

        <Box className="mt-4 flex justify-end">
          <Button variant="danger" icon={LogOut} onClick={logout}>
            Sign out
          </Button>
        </Box>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader title="Appearance" description="Applies to this browser only" icon={Palette} />
        <Box className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {([
            ['light', Sun, 'Light'],
            ['dark', Moon, 'Dark'],
          ] as const).map(([value, Icon, label]) => (
            <PlainButton
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
              <Inline className="text-body font-medium">{label}</Inline>
              {theme === value && <CheckCircle2 className="size-4 ml-auto shrink-0" strokeWidth={2} />}
            </PlainButton>
          ))}

          <PlainButton
            onClick={() => {
              localStorage.removeItem('admin_theme');
              setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
              setToast({ tone: 'good', message: 'Following your system theme.' });
            }}
            className="flex items-center gap-2.5 p-3 rounded-panel border border-line hover:bg-surface-inset text-ink-2 transition-colors text-left"
          >
            <Monitor className="size-4 shrink-0" strokeWidth={1.75} />
            <Inline className="text-body font-medium">Match system</Inline>
          </PlainButton>
        </Box>
      </Card>

      {/* API endpoint */}
      <Card>
        <CardHeader
          title="API endpoint"
          description="Where this console sends every request (configured via environment variable)"
          icon={Server}
          action={<Badge tone="neutral">Environment (.env)</Badge>}
        />

        <Box className="mt-4 space-y-4">
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
            <Box
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
              <Box className="text-sm min-w-0">
                <Text className="text-ink font-medium">{probe.message}</Text>
                {probe.health && (
                  <Text className="text-ink-2 mt-0.5 break-words">
                    Database {probe.health.database.state}
                    {probe.health.database.name && ` · ${probe.health.database.name}`}
                    {probe.health.latencyMs !== undefined && ` · ${probe.health.latencyMs}ms`}
                    {' · up '}
                    {duration(probe.health.uptimeSeconds)}
                  </Text>
                )}
              </Box>
            </Box>
          )}

          <Box className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" loading={testing} onClick={handleTest}>
              Test connection
            </Button>
          </Box>
        </Box>
      </Card>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
