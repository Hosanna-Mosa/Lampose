import React, { useState } from 'react';
import { ScrapedLead, scraperApi } from '../../../../api/scraperApi';
import { User } from '../../../../api/userApi';
import { LEAD_STATUSES } from '../../../../api/leadStatus';
import { MapLocationButton } from '../../../common/molecules/MapLocationButton';
import { X, CheckCircle2, MessageSquare, Tag, Loader2, Building2, Phone, Globe, Clock } from 'lucide-react';
import { Box, Form, Heading, Inline, Label, PlainButton, Text, TextArea } from '../../../common/atoms';

interface LeadStatusModalProps {
  lead: ScrapedLead;
  currentUser: User;
  onClose: () => void;
  onSuccess: () => void;
}

export const LeadStatusModal: React.FC<LeadStatusModalProps> = ({
  lead,
  currentUser,
  onClose,
  onSuccess
}) => {
  const [status, setStatus] = useState<string>(lead.leadStatus || 'NEW');
  const [noteText, setNoteText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const statusOptions = LEAD_STATUSES;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await scraperApi.updateLeadStatus(
        lead._id,
        status,
        noteText.trim() || undefined,
        currentUser.name
      );

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || res.message || 'Failed to update lead status.');
      }
    } catch (err: any) {
      /* 403 is the server refusing a lead that is not this rep's. Saying so
         plainly beats "Error updating lead status" — it is not a fault, it is
         a boundary, and the rep needs to know which. */
      const status = err?.response?.status;
      setError(
        status === 403
          ? 'This lead is no longer assigned to you. Refresh your list.'
          : status === 401
            ? 'Your session has expired. Sign in again.'
            : err?.response?.data?.error || err.message || 'Error updating lead status.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <Box className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-xl shadow-2xl space-y-6 relative overflow-hidden">
        <PlainButton
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </PlainButton>

        {/* Lead Header */}
        <Box className="flex items-start gap-4 pr-10">
          <Box className="w-11 h-11 rounded-2xl bg-cyan-50 border border-cyan-200 text-cyan-600 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </Box>
          <Box>
            <Heading level={2} className="text-lg font-bold text-slate-900">{lead.businessName}</Heading>
            <Box className="flex items-center gap-3 text-xs text-slate-500 mt-1">
              <Inline className="flex items-center gap-1 font-mono text-slate-600">
                <Phone className="w-3 h-3 text-cyan-600" />
                {lead.phone || 'No phone'}
              </Inline>
              <Inline>•</Inline>
              <Inline>{lead.city || 'Location unavailable'}</Inline>
            </Box>
            <Box className="pt-2">
              <MapLocationButton lead={lead} variant="full" />
            </Box>
          </Box>
        </Box>

        {error && (
          <Box className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {error}
          </Box>
        )}

        <Form onSubmit={handleUpdate} className="space-y-5">
          {/* Status Selector */}
          <Box className="space-y-2">
            <Label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-cyan-600" />
              <Inline>Update Lead Status</Inline>
            </Label>
            <Box className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {statusOptions.map((opt) => (
                <PlainButton
                  type="button"
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                    status === opt.value
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-600 shadow-lg shadow-cyan-500/10'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  <Inline>{opt.label}</Inline>
                  {status === opt.value && <CheckCircle2 className="w-4 h-4 text-cyan-600" />}
                </PlainButton>
              ))}
            </Box>
          </Box>

          {/* Add Activity Note */}
          <Box className="space-y-2">
            <Label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-cyan-600" />
              <Inline>Add Call Log / Activity Note (Optional)</Inline>
            </Label>
            <TextArea
              rows={3}
              placeholder="e.g. Called owner, interested in web design proposal. Follow up on Tuesday."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition resize-none"
            />
          </Box>

          {/* Previous Notes Log */}
          {lead.notes && lead.notes.length > 0 && (
            <Box className="space-y-2 pt-2 border-t border-slate-200">
              <Inline className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Previous Activity Log ({lead.notes.length})</Inline>
              <Box className="max-h-36 overflow-y-auto space-y-2 pr-1">
                {lead.notes.map((n, idx) => (
                  <Box key={n.id || idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <Box className="flex items-center justify-between text-3xs text-slate-500">
                      <Inline className="font-bold text-cyan-600">{n.authorName}</Inline>
                      <Inline>{new Date(n.createdAt).toLocaleString()}</Inline>
                    </Box>
                    <Text className="text-slate-600 leading-relaxed">{n.text}</Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* Action Buttons */}
          <Box className="flex items-center justify-end gap-3 pt-2">
            <PlainButton
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </PlainButton>
            <PlainButton
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/25 transition cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <Inline>Save Status & Log</Inline>
            </PlainButton>
          </Box>
        </Form>
      </Box>
    </Box>
  );
};
