import { api } from '../apiCaller';
import type { ApiResponse, WhatsAppSendMode, WhatsAppSendStatus } from '../types';

export const messagingService = {
  /** Which Content Templates are configured, plus whether Twilio itself is. */
  async getStatus(): Promise<ApiResponse<WhatsAppSendStatus>> {
    const res = await api.get<any>('/admin/whatsapp/templates');
    return res.success
      ? { ...res, data: { configured: !!res.data?.configured, from: res.data?.from || '', templates: res.data?.templates || [] } }
      : { ...res, data: { configured: false, from: '', templates: [] } };
  },

  /**
   * Send one WhatsApp message. `mode: 'text'` takes `body`; `mode:
   * 'template'` takes `templateKey` (a WhatsAppTemplate.key) and `variables`
   * (numbered strings, e.g. { '1': 'Priya', '2': 'Sunrise PG' }).
   */
  async send(payload: {
    to: string;
    mode: WhatsAppSendMode;
    body?: string;
    templateKey?: string;
    variables?: Record<string, string>;
  }): Promise<ApiResponse<{ sid: string } | null>> {
    const res = await api.post<any>('/admin/whatsapp/send', payload);
    return res.success ? { ...res, data: res.data?.data || null } : { ...res, data: null };
  },
};
