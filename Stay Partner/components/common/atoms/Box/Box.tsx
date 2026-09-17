import { View, type ViewProps } from 'react-native';

/**
 * `View`, under a name.
 *
 * The workhorse: 259 of the 284 bare primitives in `app/` were this one. It
 * passes every prop straight through and adds no element of its own, which is
 * the property that makes the swap safe to do mechanically across the whole
 * app at once -- the rendered tree after the swap is the tree before it.
 *
 * Nothing is "improved" here. No default padding, no default style, no
 * `flex: 1`. A wrapper that decided anything would change what renders on
 * every screen at once, and the whole method rests on it not doing that.
 */
export const Box = ({ children, ...rest }: ViewProps) => <View {...rest}>{children}</View>;
