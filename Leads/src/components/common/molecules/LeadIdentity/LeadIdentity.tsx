import React from 'react';
import { Building2 } from 'lucide-react';
import { Box, Inline, Text } from '../../atoms';

/* The business name cell of the leads table: an icon tile beside the name
   and its category. Written out identically on the Scraped Leads dashboard
   and in the Newly Extracted modal.

   As with SelectionToggle, only the inner block is shared. The TableCell
   around it keeps its own vertical padding in each caller (the dashboard
   sits a little taller than the modal), because that difference was already
   there and is not this refactor's to reconcile.

   The `|| 'Business'` fallback lives here rather than at the call sites,
   exactly as it did before, so an empty category still renders the same
   word it always did.

   NOTE: avoid writing Tailwind-utility-shaped words in this file's prose.
   Tailwind scans comments too, and will emit a real CSS rule for one. */
export interface LeadIdentityProps {
  businessName: string;
  category?: string;
}

export const LeadIdentity: React.FC<LeadIdentityProps> = ({ businessName, category }) => (
  <Box className="flex items-center gap-2.5">
    <Box className="w-7 h-7 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
      <Building2 className="w-3.5 h-3.5" />
    </Box>
    <Box>
      <Text className="font-bold text-slate-900 leading-tight">{businessName}</Text>
      <Inline className="text-3xs text-slate-500">{category || 'Business'}</Inline>
    </Box>
  </Box>
);
