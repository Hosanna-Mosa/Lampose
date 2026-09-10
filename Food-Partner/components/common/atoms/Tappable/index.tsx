import { Pressable, type PressableProps } from "react-native";

/**
 * `Pressable`, with a name. Deliberately NOT merged with `TouchableOpacity`:
 * their press feedback differs, and a refactor is not the place to change how a
 * button feels.
 *
 * Typed as the full `PressableProps`, which keeps the `({ pressed }) => …` child
 * and style-function forms working. No screen uses them today; typing for them
 * costs nothing and means this stays a faithful pass-through if one starts.
 */
export const Tappable = ({ children, ...rest }: PressableProps) => (
  <Pressable {...rest}>{children}</Pressable>
);
