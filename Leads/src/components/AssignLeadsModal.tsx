import React, { useState } from 'react';
import { User } from '../api/userApi';
import { scraperApi } from '../api/scraperApi';
import { X, UserCheck, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

interface AssignLeadsModalProps {
  leadIds: string[];
  employeesList: User[];
  onClose: () => void;
  onSuccess: () => void;
}

export const AssignLeadsModal: React.FC<AssignLeadsModalProps> = ({
  leadIds,
  employeesList,
  onClose,
  onSuccess
}) => {
  const [selectedUserId, setSelectedUserId] = useState(employeesList[0]?.userId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAssign = async () => {
    if (!selectedUserId) {
      setError('Please select an employee.');
      return;
    }

    const employee = employeesList.find(e => e.userId === selectedUserId);
    if (!employee) return;

    setLoading(true);
    setError('');

    try {
      const res = await scraperApi.assignLeads(leadIds, {
        userId: employee.userId,
        name: employee.name,
        email: employee.email
      });

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || 'Failed to assign leads.');
      }
    } catch (err: any) {
      setError(err.message || 'Error assigning leads.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-50 border border-cyan-200 text-cyan-600 flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Assign Leads to Employee</h3>
            <p className="text-xs text-slate-500">Assign {leadIds.length} lead(s) to a team member</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-600">Select Employee</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
          >
            {employeesList.map((emp) => (
              <option key={emp.userId} value={emp.userId}>
                👤 {emp.name} ({emp.email})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/25 transition cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>Confirm Assignment</span>
          </button>
        </div>
      </div>
    </div>
  );
};
