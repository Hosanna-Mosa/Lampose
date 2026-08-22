import React, { useMemo, useState } from 'react';
import { AlertTriangle, MessageCircle, RefreshCw, Send, TriangleAlert } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  IconButton,
  Input,
  PageHeader,
  Select,
  Textarea,
  Toast,
  cx,
  type ToastState,
} from '../components/ui';
import { messagingService } from '../api/services/messagingService';
import { useFetch } from '../lib/useFetch';
import type { WhatsAppSendMode, WhatsAppTemplate } from '../api/types';

/** "1 owner name · 2 property · …" → [{ key: "1", label: "owner name" }, …].
 *  Purely a UI convenience for pre-drawing the right number of variable
 *  fields — the backend does not require these keys or this count, see
 *  messaging.routes.js. */
const parseTemplateHint = (hint: string): { key: string; label: string }[] =>
  hint
    .split('·')
    .map((segment) => segment.trim().match(/^(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ key: m[1], label: m[2] }));

export const MessagesPage: React.FC = () => {
  const { data: status, loading, error, refreshing, reload } = useFetch(() => messagingService.getStatus(), []);

  const [to, setTo] = useState('');
  const [mode, setMode] = useState<WhatsAppSendMode>('text');
  const [body, setBody] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const templates = status?.templates || [];
  const selectedTemplate: WhatsAppTemplate | undefined = templates.find((t) => t.key === templateKey);
  const templateFields = useMemo(
    () => (selectedTemplate ? parseTemplateHint(selectedTemplate.hint) : []),
    [selectedTemplate]
  );

  const selectTemplate = (key: string) => {
    setTemplateKey(key);
    setVariables({});
  };

  const canSend = to.trim().length >= 8
    && !busy
    && (mode === 'text' ? body.trim().length > 0 : !!templateKey);

  const handleSend = async () => {
    setBusy(true);
    const res = await messagingService.send({
      to: to.trim(),
      mode,
      ...(mode === 'text' ? { body: body.trim() } : { templateKey, variables }),
    });
    setBusy(false);

    if (res.success) {
      setToast({ tone: 'good', message: `Message sent. SID ${res.data?.sid || '—'}` });
      if (mode === 'text') setBody('');
      else setVariables({});
    } else {
      setToast({ tone: 'crit', message: res.message || 'Could not send the message.' });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Tools"
        title="Messages"
        description="Send an ad-hoc WhatsApp message from the same Twilio number every automated flow in the backend already uses."
        actions={
          <IconButton icon={RefreshCw} label="Reload Twilio status" onClick={reload} spinning={refreshing || loading} />
        }
      />

      <Card padded={false}>
        <div className="p-4 flex items-center justify-between gap-4">
          <CardHeader
            icon={MessageCircle}
            title="Twilio"
            description={
              loading ? 'Checking…'
                : status?.configured ? `Sending from whatsapp:${status.from}`
                : 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set on the server.'
            }
          />
          {!loading && (
            <Badge tone={status?.configured ? 'good' : 'crit'}>
              {status?.configured ? 'Configured' : 'Not configured'}
            </Badge>
          )}
        </div>
      </Card>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-panel bg-crit-soft border border-crit-border">
          <AlertTriangle className="size-4 text-crit shrink-0 mt-0.5" strokeWidth={2} />
          <p className="text-sm text-ink-2">{error}</p>
        </div>
      )}

      <Card>
        <div className="space-y-4 max-w-xl">
          <Field label="Recipient" required hint="WhatsApp number. A bare 10-digit number is read as Indian; anything else needs its country code.">
            <Input
              type="tel"
              placeholder="+91 98765 43210"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>

          <div>
            <span className="block text-label text-ink-2 mb-1.5">Message type</span>
            <div className="inline-flex rounded-control border border-line overflow-hidden">
              {(['text', 'template'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cx(
                    'h-8 px-3 text-label transition-colors duration-120',
                    mode === m ? 'bg-brand-soft text-brand-ink font-medium' : 'text-ink-2 hover:bg-surface-inset'
                  )}
                >
                  {m === 'text' ? 'Free text' : 'Content template'}
                </button>
              ))}
            </div>
          </div>

          {mode === 'text' ? (
            <Field
              label="Message"
              required
              hint="Only delivers if this number messaged the Twilio number first, inside the last 24 hours — Twilio/Meta reject it otherwise. Use a template to reach someone cold."
            >
              <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type the message…" />
            </Field>
          ) : (
            <>
              <Field label="Template" required hint={templates.length ? undefined : 'No Content Template SIDs are set in the backend .env.'}>
                <Select value={templateKey} onChange={(e) => selectTemplate(e.target.value)}>
                  <option value="">Choose a template…</option>
                  {templates.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </Select>
              </Field>

              {selectedTemplate && (
                <div className="p-3 rounded-panel bg-warn-soft border border-warn-border flex gap-2.5">
                  <TriangleAlert className="size-4 text-warn shrink-0 mt-0.5" strokeWidth={2} />
                  <p className="text-sm text-ink-2 leading-relaxed">
                    This template was approved for a specific automated flow. If it carries reply buttons
                    tied to a request ID, sending it here with no matching record means the buttons won&apos;t
                    resolve to anything — this is best used for a manual resend of a real request, or testing.
                  </p>
                </div>
              )}

              {templateFields.length > 0 && (
                <div className="space-y-3">
                  {templateFields.map((f) => (
                    <Field key={f.key} label={`{{${f.key}}} — ${f.label}`}>
                      <Input
                        value={variables[f.key] || ''}
                        onChange={(e) => setVariables((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    </Field>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="pt-1">
            <Button variant="primary" icon={Send} loading={busy} disabled={!canSend} onClick={handleSend}>
              Send message
            </Button>
          </div>
        </div>
      </Card>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
