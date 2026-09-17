import { useState } from 'react';

/* The lead-selection state shared by the Scraped Leads dashboard and the
   Newly Extracted modal. Both had written out the same state and the same
   two toggles, character for character.

   This does EXACTLY what the copies did, including the parts worth
   questioning:

   · `toggleSelectAll` compares `selectedLeadIds.length === leads.length`, so
     an empty list counts as "all selected" and the first click selects
     nothing. Both copies behaved that way; the callers guard the display
     with `selectedLeadIds.length > 0 &&`. Left alone — quietly "correcting"
     it here would change two screens without anybody asking.

   · Both toggles close over the current array rather than using the updater
     form of setState. That is the behaviour the copies had, and changing it
     would alter how rapid successive clicks batch.

   `setSelectedLeadIds` is returned because both callers use it directly:
   to clear the selection after assigning, and — on the dashboard only — to
   preselect a single lead. */
export function useLeadSelection(leads: { _id: string }[]) {
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const toggleSelectLead = (id: string) => {
    if (selectedLeadIds.includes(id)) {
      setSelectedLeadIds(selectedLeadIds.filter(i => i !== id));
    } else {
      setSelectedLeadIds([...selectedLeadIds, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map(l => l._id));
    }
  };

  return { selectedLeadIds, setSelectedLeadIds, toggleSelectLead, toggleSelectAll };
}
