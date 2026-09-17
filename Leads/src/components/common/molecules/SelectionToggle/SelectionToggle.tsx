import React from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { PlainButton } from '../../atoms';

/* The checkbox control used by the leads tables, in four places: the header
   toggle that selects every row, and the per-row toggle, on both the Scraped
   Leads dashboard and the Newly Extracted modal. All four were written out
   identically.

   NOTE — do not write Tailwind-utility-shaped words in this file's prose.
   Tailwind's content scanner extracts class-like tokens from ANY text it
   scans, comments included. An earlier version of this comment contained
   the hyphenated form of "select all", which is a real utility, and Tailwind
   duly emitted a `user-select: all` rule into the stylesheet on every
   screen. Nothing used it and no pixel moved, but the rendered markup
   changed — which is the one thing this refactor promises it does not do.

   Only the BUTTON is shared. The cell around it is not: the dashboard uses
   `py-3.5` and the modal `py-3`, and that difference is left exactly where
   it was rather than "unified". Near-identical is not identical, and the
   difference is usually deliberate — collapsing it would change one of the
   two screens. */
export interface SelectionToggleProps {
  checked: boolean;
  onToggle: () => void;
}

export const SelectionToggle: React.FC<SelectionToggleProps> = ({ checked, onToggle }) => (
  <PlainButton onClick={onToggle} className="text-slate-500 hover:text-cyan-600">
    {checked ? (
      <CheckSquare className="w-4 h-4 text-cyan-600" />
    ) : (
      <Square className="w-4 h-4" />
    )}
  </PlainButton>
);
