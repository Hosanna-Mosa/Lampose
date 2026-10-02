/* ══════════════════════════════════════════════════════════════════════════
   Filtering and paging a restaurant's menu — shared by the owner's Menu page
   and the staff console's restaurant drawer.

   Client-side on purpose: both screens already hold the whole menu (a
   kitchen's menu is tens of dishes, rarely a few hundred), so a filter is a
   pass over an array rather than a request per keystroke, and the two screens
   cannot disagree about what a filter means.

   The order of the input is kept. The server returns dishes in the order the
   diner's menu is drawn (`category`, `displayOrder`, `createdAt`), and a page
   that re-sorted them would show an owner a different menu from the one
   their customers see.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useState } from 'react';

/** The fields both menu shapes share. */
export interface FilterableDish {
  productName: string;
  category: string;
  description?: string;
  isVeg: 'veg' | 'non-veg' | 'egg';
  price: number;
  discountedPrice?: number | null;
  isAvailable: boolean;
  productImage?: { url?: string } | null;
  tags?: string[];
}

export type VegFilter = 'all' | 'veg' | 'non-veg' | 'egg';
export type StockFilter = 'all' | 'in' | 'out';
export type OfferFilter = 'all' | 'offer' | 'none';
export type PhotoFilter = 'all' | 'with' | 'without';

export interface MenuFilters {
  search: string;
  category: string; // '' = every section
  veg: VegFilter;
  stock: StockFilter;
  offer: OfferFilter;
  photo: PhotoFilter;
}

export const EMPTY_MENU_FILTERS: MenuFilters = {
  search: '',
  category: '',
  veg: 'all',
  stock: 'all',
  offer: 'all',
  photo: 'all',
};

export const PAGE_SIZES = [10, 20, 50, 100] as const;

/** True when any filter other than the search box is set. */
export const hasActiveFilters = (filters: MenuFilters): boolean =>
  Boolean(filters.category)
  || filters.veg !== 'all'
  || filters.stock !== 'all'
  || filters.offer !== 'all'
  || filters.photo !== 'all';

const onOffer = (dish: FilterableDish) =>
  dish.discountedPrice != null && dish.discountedPrice < dish.price;

export const filterMenu = <T extends FilterableDish>(dishes: T[], filters: MenuFilters): T[] => {
  const needle = filters.search.trim().toLowerCase();
  return dishes.filter((dish) => {
    if (filters.category && (dish.category || 'Uncategorised') !== filters.category) return false;
    if (filters.veg !== 'all' && dish.isVeg !== filters.veg) return false;
    if (filters.stock === 'in' && !dish.isAvailable) return false;
    if (filters.stock === 'out' && dish.isAvailable) return false;
    if (filters.offer === 'offer' && !onOffer(dish)) return false;
    if (filters.offer === 'none' && onOffer(dish)) return false;
    const hasPhoto = Boolean(dish.productImage?.url);
    if (filters.photo === 'with' && !hasPhoto) return false;
    if (filters.photo === 'without' && hasPhoto) return false;
    if (!needle) return true;
    return [dish.productName, dish.category, dish.description, ...(dish.tags ?? [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });
};

/** Every section name, in first-seen order. */
export const categoriesOf = (dishes: FilterableDish[]): string[] =>
  [...new Set(dishes.map((dish) => dish.category || 'Uncategorised'))];

/**
 * Filters plus paging over one menu. The page goes back to 1 when the filters
 * or the page size change, so a filter never lands on an empty page 4. A menu
 * reload (switching a dish out of stock) keeps the page, clamped to the last
 * one if the list got shorter.
 */
export function useMenuView<T extends FilterableDish>(dishes: T[], externalSearch = '', initialPageSize = 20) {
  const [filters, setFilters] = useState<MenuFilters>(EMPTY_MENU_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);

  const effective = useMemo(
    () => ({ ...filters, search: [externalSearch, filters.search].filter((s) => s.trim()).join(' ').trim() }),
    [filters, externalSearch],
  );

  const filtered = useMemo(() => filterMenu(dishes, effective), [dishes, effective]);
  const categories = useMemo(() => categoriesOf(dishes), [dishes]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [effective, pageSize]);

  const current = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => filtered.slice((current - 1) * pageSize, current * pageSize),
    [filtered, current, pageSize],
  );

  return {
    filters,
    setFilters,
    resetFilters: () => setFilters(EMPTY_MENU_FILTERS),
    categories,
    filtered,
    pageItems,
    page: current,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    total: dishes.length,
  };
}
