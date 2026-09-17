import { ActivityIndicator, type ActivityIndicatorProps } from 'react-native';

/**
 * `ActivityIndicator`, under a name.
 *
 * No default size and no default colour. Every call site in `app/` passes its
 * own, and supplying one here would change eight screens at once in a way the
 * diff would not show.
 */
export const Spinner = (props: ActivityIndicatorProps) => <ActivityIndicator {...props} />;
