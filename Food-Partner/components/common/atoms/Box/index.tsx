import { View, type ViewProps } from "react-native";

/**
 * `View`, with a name.
 *
 * A thin pass-through and nothing else: every prop goes straight to `View`, so
 * substituting it cannot change what renders. That property is the whole reason
 * the swap can be done mechanically across the app at once — and the reason this
 * file must never grow a default style, a padding prop, or a clever wrapper.
 */
export const Box = ({ children, ...rest }: ViewProps) => <View {...rest}>{children}</View>;
