import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { StayCategory } from '@/constants/tokens';
import type { Locality } from '@/types/auth';

/**
 * First-run state: where the user is browsing, and which kind of place.
 *
 * Neither belongs to the account. Both are answered before anyone signs in — a
 * guest browses freely — so they live on the device and survive independently
 * of any session. Signing out must not send a returning user back through the
 * location screen.
 *
 * ## The category is now required, and it filters
 *
 * This reverses the earlier design, and the reversal is worth recording because
 * the code still has to be safe under it.
 *
 * It used to be skippable and it only *reordered* the feed — nothing was ever
 * hidden, which is exactly why skipping cost nothing. Now the feed shows one
 * category and the other three are not in it.
 *
 * That makes this value load-bearing in a way a preference never was: a wrong
 * value hides three quarters of the inventory. Two consequences are enforced
 * here rather than left to screens:
 *
 *  1. **`category` is never null once answered**, and the entry step cannot be
 *     skipped past. `app/index.tsx` routes to it whenever it is null.
 *  2. **It is changeable, always.** `CategoryTabs` above the feed writes
 *     straight back here. A required filter with no visible way out is a trap,
 *     and the tab row is what stops one mis-tap on the entry screen from
 *     permanently hiding co-lives from someone.
 */

const LOCALITY_KEY = '@lampose/locality';
const CATEGORY_KEY = '@lampose/category';

type AppStateValue = {
  /** True until the stored values have been read. */
  hydrating: boolean;

  /** Null until the one-time location screen has been answered. */
  locality: Locality | null;
  setLocality: (locality: Locality) => Promise<void>;

  /**
   * The one category the feed shows. Null only before the entry step has been
   * answered — which is a state the router does not let anyone browse in.
   */
  category: StayCategory | null;
  /**
   * Writes it, from the entry screen or from the tab row above the feed. The
   * two are the same act, so they are the same function.
   */
  setCategory: (category: StayCategory) => Promise<void>;
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [hydrating, setHydrating] = useState(true);
  const [locality, setLocalityState] = useState<Locality | null>(null);
  const [category, setCategoryState] = useState<StayCategory | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([AsyncStorage.getItem(LOCALITY_KEY), AsyncStorage.getItem(CATEGORY_KEY)])
      .then(([storedLocality, storedCategory]) => {
        if (!active) return;
        if (storedLocality) {
          try {
            setLocalityState(JSON.parse(storedLocality) as Locality);
          } catch {
            // A corrupt value just means we ask again. Nothing to report.
          }
        }
        // Stored as a bare string, so there is nothing to parse and nothing to
        // corrupt. A value we do not recognise is discarded rather than
        // trusted — an unknown category would filter the feed to nothing.
        if (storedCategory && isCategory(storedCategory)) {
          setCategoryState(storedCategory);
        }
      })
      .finally(() => {
        if (active) setHydrating(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const setLocality = useCallback(async (next: Locality) => {
    setLocalityState(next);
    await AsyncStorage.setItem(LOCALITY_KEY, JSON.stringify(next));
  }, []);

  const setCategory = useCallback(async (next: StayCategory) => {
    // Optimistic: the feed changes on the same frame as the tap. A round trip
    // to disk before the tab row responds would be felt.
    setCategoryState(next);
    await AsyncStorage.setItem(CATEGORY_KEY, next);
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({ hydrating, locality, setLocality, category, setCategory }),
    [hydrating, locality, setLocality, category, setCategory],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used inside AppStateProvider');
  return context;
}

const CATEGORIES: readonly string[] = ['PG_HOSTEL', 'BACHELOR', 'COLIVE', 'HOTEL'];

function isCategory(value: string): value is StayCategory {
  return CATEGORIES.includes(value);
}
