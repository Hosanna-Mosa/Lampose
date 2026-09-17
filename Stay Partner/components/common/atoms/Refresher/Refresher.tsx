import { RefreshControl, type RefreshControlProps } from 'react-native';

/**
 * `RefreshControl`, under a name.
 *
 * Passed as the `refreshControl` prop of a scroller rather than rendered as a
 * child, which is why it looks unlike the others at the call site. It is still
 * a bare primitive appearing in a screen file, so it still scores, and it is
 * still swapped one-for-one.
 */
export const Refresher = (props: RefreshControlProps) => <RefreshControl {...props} />;
