import React from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';

import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useTheme } from '@/context/ThemeContext';

export type PullRefreshControlProps = Omit<RefreshControlProps, 'refreshing' | 'onRefresh'> & {
  /** What a pull does. May return a promise; the spinner stays until it settles. */
  onRefresh: () => unknown;
};

/**
 * `RefreshControl` whose spinner follows the PULL, not the query.
 *
 * A drop-in for the screens that bound `refreshing` to `isFetching` — see
 * `usePullToRefresh` for why that made the spinner appear on its own. It owns
 * its state, so a screen swaps one element and needs no new hook above its
 * early returns.
 *
 * Every prop, `children` and `style` included, goes through to the real
 * control: on Android a `ScrollView` clones its `refreshControl` and nests
 * itself inside it, and anything dropped here would drop the list.
 */
export function PullRefreshControl({ onRefresh, tintColor, ...rest }: PullRefreshControlProps) {
  const { colors } = useTheme();
  const pull = usePullToRefresh(onRefresh);
  return (
    <RefreshControl
      {...rest}
      tintColor={tintColor ?? colors.brand}
      colors={rest.colors ?? [colors.brand]}
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
    />
  );
}
