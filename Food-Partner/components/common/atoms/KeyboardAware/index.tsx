import { KeyboardAvoidingView, type KeyboardAvoidingViewProps } from "react-native";

/**
 * `KeyboardAvoidingView`, with a name. Structural: one per form screen, never
 * scattered. Its `behavior` differs per platform and stays the caller's choice —
 * this wrapper does not pick one, because picking one would change layout on
 * whichever platform it guessed wrong.
 */
export const KeyboardAware = ({ children, ...rest }: KeyboardAvoidingViewProps) => (
  <KeyboardAvoidingView {...rest}>{children}</KeyboardAvoidingView>
);
