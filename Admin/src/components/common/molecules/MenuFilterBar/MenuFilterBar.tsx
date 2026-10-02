/**
 * Lampose Admin — the filter row above a restaurant's menu.
 *
 * Section, food type, stock, offer and photo, plus an optional search box for
 * screens that have no header search of their own (the staff drawer). The
 * logic lives in `lib/menuFilter.ts`; this only draws the controls.
 */
import React from 'react';
import { Search, X } from 'lucide-react';
import { cx } from '../../utils/cx';
import { Box } from '../../atoms/Box';
import { Option } from '../../atoms/Option';
import { PlainButton } from '../../atoms/PlainButton';
import { Select } from '../../atoms/Select';
import { SearchInput } from '../SearchInput';
import { hasActiveFilters } from '../../../../lib/menuFilter';
import type {
  MenuFilters,
  OfferFilter,
  PhotoFilter,
  StockFilter,
  VegFilter,
} from '../../../../lib/menuFilter';

interface MenuFilterBarProps {
  filters: MenuFilters;
  onChange: (next: MenuFilters) => void;
  onReset: () => void;
  categories: string[];
  /** Show a search box. Off where the page header already searches. */
  withSearch?: boolean;
  className?: string;
}

const selectClass = 'h-9 py-0 text-label w-auto min-w-0';

export const MenuFilterBar: React.FC<MenuFilterBarProps> = ({
  filters,
  onChange,
  onReset,
  categories,
  withSearch = false,
  className,
}) => {
  const set = <K extends keyof MenuFilters>(key: K, value: MenuFilters[K]) =>
    onChange({ ...filters, [key]: value });
  const active = hasActiveFilters(filters) || Boolean(filters.search.trim());

  return (
    <Box className={cx('flex flex-wrap items-center gap-2', className)}>
      {withSearch && (
        <SearchInput
          icon={Search}
          className="flex-1 min-w-48"
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search dishes"
          aria-label="Search dishes"
        />
      )}

      <Select
        aria-label="Section"
        className={selectClass}
        value={filters.category}
        onChange={(e) => set('category', e.target.value)}
      >
        <Option value="">All sections</Option>
        {categories.map((category) => (
          <Option key={category} value={category}>
            {category}
          </Option>
        ))}
      </Select>

      <Select
        aria-label="Food type"
        className={selectClass}
        value={filters.veg}
        onChange={(e) => set('veg', e.target.value as VegFilter)}
      >
        <Option value="all">All types</Option>
        <Option value="veg">Veg</Option>
        <Option value="egg">Egg</Option>
        <Option value="non-veg">Non-veg</Option>
      </Select>

      <Select
        aria-label="Stock"
        className={selectClass}
        value={filters.stock}
        onChange={(e) => set('stock', e.target.value as StockFilter)}
      >
        <Option value="all">In &amp; out of stock</Option>
        <Option value="in">In stock</Option>
        <Option value="out">Sold out</Option>
      </Select>

      <Select
        aria-label="Offer"
        className={selectClass}
        value={filters.offer}
        onChange={(e) => set('offer', e.target.value as OfferFilter)}
      >
        <Option value="all">Any price</Option>
        <Option value="offer">On offer</Option>
        <Option value="none">No offer</Option>
      </Select>

      <Select
        aria-label="Photo"
        className={selectClass}
        value={filters.photo}
        onChange={(e) => set('photo', e.target.value as PhotoFilter)}
      >
        <Option value="all">With or without photo</Option>
        <Option value="with">Has a photo</Option>
        <Option value="without">No photo</Option>
      </Select>

      {active && (
        <PlainButton
          className="inline-flex items-center gap-1 h-9 px-2 text-label text-ink-2 hover:text-ink"
          onClick={onReset}
        >
          <X className="size-3.5" />
          Clear filters
        </PlainButton>
      )}
    </Box>
  );
};
