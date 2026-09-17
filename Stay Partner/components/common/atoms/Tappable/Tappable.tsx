import { Pressable, type PressableProps } from 'react-native';

/**
 * `Pressable`, under a name.
 *
 * Deliberately NOT merged with `TouchableOpacity`: their press feedback
 * differs, so one name for both would change how a tap looks on whichever of
 * them lost. This app uses `Pressable` throughout and no `TouchableOpacity`
 * at all, so only this one exists -- an empty `Touchable` folder would be a
 * promise the code has not made.
 *
 * `children` is passed through untouched because `Pressable` accepts both a
 * node and a render function of its press state, and flattening that to a node
 * would quietly break every pressed-state style in the app.
 */
export const Tappable = ({ children, ...rest }: PressableProps) => (
  <Pressable {...rest}>{children}</Pressable>
);
