/**
 * The header search box, readable by anything inside the layout.
 *
 * The value lives in App.tsx and reaches pages as a `search` prop; this exists
 * so `ResultCount`'s Clear can empty the box as well as the page's own
 * filters, and so a page can draw a second box beside its filters that types
 * into the same value — without every page threading a setter through. Outside the layout
 * (or on a tab without the box) it is an empty, inert value.
 */
import { createContext, useContext } from 'react';

export interface HeaderSearch {
  search: string;
  set: (value: string) => void;
  clear: () => void;
}

export const HeaderSearchContext = createContext<HeaderSearch>({ search: '', set: () => {}, clear: () => {} });

export const useHeaderSearch = (): HeaderSearch => useContext(HeaderSearchContext);
