import React, { useState } from 'react';
import { ScrapedLead, scraperApi } from '../api/scraperApi';
import { User } from '../api/userApi';
import { MapLocationButton } from './MapLocationButton';
import { X, CheckCircle2, MessageSquare, Tag, Loader2, Building2, Phone, Globe, Clock } from 'lucide-react';

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

  const statusOptions = [
    { value: 'NEW', label: '🆕 New Lead', color: 'bg-slate-100 text-slate-600' },
    { value: 'CONTACTED', label: '📞 Contacted / Called', color: 'bg-blue-100 text-blue-600' },
    { value: 'INTERESTED', label: '🔥 Interested', color: 'bg-cyan-100 text-cyan-600' },
    { value: 'QUALIFIED', label: '⭐ Qualified Opportunity', color: 'bg-amber-100 text-amber-600' },
    { value: 'CALLBACK', label: '⏰ Call Back Requested', color: 'bg-purple-100 text-purple-600' },
    { value: 'CLOSED_WON', label: '🎉 Closed Won / Client', color: 'bg-emerald-100 text-emerald-600' },
    { value: 'CLOSED_LOST', label: '❌ Closed Lost', color: 'bg-rose-100 text-rose-600' },
  ];

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
        setError(res.error || 'Failed to update lead status.');
      }
    } catch (err: any) {
      setError(err.message || 'Error updating lead status.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-xl shadow-2xl space-y-6 relative overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Lead Header */}
        <div className="flex items-start gap-4 pr-10">
          <div className="w-11 h-11 rounded-2xl bg-cyan-50 border border-cyan-200 text-cyan-600 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{lead.businessName}</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
              <span className="flex items-center gap-1 font-mono text-slate-600">
                <Phone className="w-3 h-3 text-cyan-600" />
                {lead.phone || 'No phone'}
              </span>
              <span>•</span>
              <span>{lead.city || 'Location unavailable'}</span>
            </div>
            <div className="pt-2">
              <MapLocationButton lead={lead} variant="full" />
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-5">
          {/* Status Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-cyan-600" />
              <span>Update Lead Status</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {statusOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                    status === opt.value
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-600 shadow-lg shadow-cyan-500/10'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  <span>{opt.label}</span>
                  {status === opt.value && <CheckCircle2 className="w-4 h-4 text-cyan-600" />}
                </button>
              ))}
            </div>
          </div>

          {/* Add Activity Note */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-cyan-600" />
              <span>Add Call Log / Activity Note (Optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Called owner, interested in web design proposal. Follow up on Tuesday."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition resize-none"
            />
          </div>

          {/* Previous Notes Log */}
          {lead.notes && lead.notes.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Previous Activity Log ({lead.notes.length})</span>
              <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                {lead.notes.map((n, idx) => (
                  <div key={n.id || idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between text-3xs text-slate-500">
                      <span className="font-bold text-cyan-600">{n.authorName}</span>
                      <span>{new Date(n.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{n.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/25 transition cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>Save Status & Log</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
