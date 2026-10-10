/**
 * Lampose Admin — the filter row above a list.
 *
 * One layout for every page: optional search box on the left, the page's own
 * chips and selects after it, and the result count pushed to the right. The
 * header search still exists; `search` here is for pages (or drawers) that
 * want a box of their own next to the filters.
 */
import React from 'react';
import { Search } from 'lucide-react';
import { cx } from '../../utils/cx';
import { Box } from '../../atoms/Box';
import { SearchInput } from '../SearchInput';

interface FilterBarProps {
  children?: React.ReactNode;
  /** Right-aligned: usually a <ResultCount />. */
  summary?: React.ReactNode;
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({ children, summary, search, className }) => (
  <Box className={cx('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
    {search && (
      <SearchInput
        icon={Search}
        type="search"
        className="w-full sm:w-64"
        value={search.value}
        onChange={(e) => search.onChange(e.target.value)}
        placeholder={search.placeholder ?? 'Search'}
        aria-label={search.placeholder ?? 'Search'}
      />
    )}
    {children}
    {summary && <Box className="ml-auto">{summary}</Box>}
  </Box>
);

