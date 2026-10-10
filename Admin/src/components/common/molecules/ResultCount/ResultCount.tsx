/**
 * Lampose Admin — "Showing 12 of 140 properties", plus a way back to all of them.
 *
 * Sits at the end of a filter row. When nothing narrows the list it just says
 * how many there are; when a search or filter does, it says how many survived
 * and offers "Clear" so nobody has to undo four controls by hand. Clear also
 * empties the header search box, since that narrows the list as well.
 */
import React from 'react';
import { X } from 'lucide-react';
import { cx } from '../../utils/cx';
import { Box } from '../../atoms/Box';
import { Inline } from '../../atoms/Inline';
import { PlainButton } from '../../atoms/PlainButton';
import { useHeaderSearch } from '../../../../context/headerSearch';

interface ResultCountProps {
  shown: number;
  total: number;
  /** Plural noun: "properties", "orders". */
  noun?: string;
  /** Shown only when something narrows the list. */
  onClear?: () => void;
  /** True when a search or filter is narrowing the list. Defaults to shown !== total. */
  filtered?: boolean;
  /** For a list the header search does not narrow (a drawer, a sub-table): Clear leaves the header box alone. */
  local?: boolean;
  className?: string;
}

const n = (v: number) => v.toLocaleString('en-IN');

export const ResultCount: React.FC<ResultCountProps> = ({
  shown,
  total,
  noun = 'records',
  onClear,
  filtered,
  local = false,
  className,
}) => {
  const header = useHeaderSearch();
  const searching = !local && Boolean(header.search.trim());
  const narrowed = filtered ?? shown !== total;
  const canClear = (narrowed || searching) && (Boolean(onClear) || searching);
  const clear = () => {
    onClear?.();
    if (searching) header.clear();
  };
  return (
    <Box className={cx('flex items-center gap-2 text-label text-ink-3 tabular', className)} aria-live="polite">
      <Inline>
        {narrowed ? (
          <>
            Showing <Inline className="font-medium text-ink">{n(shown)}</Inline> of {n(total)} {noun}
          </>
        ) : (
          <>
            <Inline className="font-medium text-ink">{n(total)}</Inline> {noun}
          </>
        )}
      </Inline>
      {canClear && (
        <PlainButton
          onClick={clear}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-control text-label text-ink-2 hover:bg-surface-inset hover:text-ink"
        >
          <X className="size-3.5" />
          Clear
        </PlainButton>
      )}
    </Box>
  );
};
