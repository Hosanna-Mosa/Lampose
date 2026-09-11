import { Lock, Hourglass, CheckCircle2, ShieldX } from 'lucide-react';

export const PERMISSION_NOTES = {
  none: { icon: Lock, color: '#64748b', text: 'Locked — ask an administrator for access' },
  pending: { icon: Hourglass, color: '#b45309', text: 'Requested — awaiting administrator approval' },
  granted: { icon: CheckCircle2, color: '#45855a', text: 'Approved by administrator' },
  denied: { icon: ShieldX, color: '#dc2626', text: 'Administrator denied this request' },
  revoked: { icon: ShieldX, color: '#dc2626', text: 'Access was revoked by an administrator' },
  used: { icon: Lock, color: '#64748b', text: 'Approval already used — ask again if you need it' },
};
