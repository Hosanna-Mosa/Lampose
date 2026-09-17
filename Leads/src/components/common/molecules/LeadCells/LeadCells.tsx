import React from 'react';
import { Star } from 'lucide-react';
import { Box, Inline } from '../../atoms';

/* The three leads-table cells that the Scraped Leads dashboard and the Newly
   Extracted modal had written out identically: the phone number, the rating,
   and who the lead is assigned to.

   They share a file because they are the same table's cells and are only
   ever meaningful together — the same reason the table primitives share one.

   Only the CONTENT of each cell is shared. The TableCell wrapper stays at
   each call site, because its vertical padding differs between the two
   screens and that difference predates this refactor.

   Each keeps its original fallback exactly: "No Phone" in italics, a bare
   dash for a missing rating, "Unassigned" in italics. */

export const LeadPhone: React.FC<{ phone?: string }> = ({ phone }) => (
  phone ? (
    <Inline className="font-mono text-slate-800">{phone}</Inline>
  ) : (
    <Inline className="text-slate-400 italic">No Phone</Inline>
  )
);

export const LeadRating: React.FC<{ rating?: string }> = ({ rating }) => (
  rating ? (
    <Box className="flex items-center gap-1 text-amber-600 font-bold">
      <Star className="w-3 h-3 fill-amber-400" />
      <Inline>{rating}</Inline>
    </Box>
  ) : (
    <Inline className="text-slate-400">-</Inline>
  )
);

export const LeadAssignee: React.FC<{ name?: string | null }> = ({ name }) => (
  name ? (
    <Inline className="px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-600 text-3xs font-bold border border-cyan-200">
      👤 {name}
    </Inline>
  ) : (
    <Inline className="text-slate-400 italic">Unassigned</Inline>
  )
);
