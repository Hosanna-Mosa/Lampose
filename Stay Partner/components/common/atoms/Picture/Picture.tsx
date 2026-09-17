import { Image, type ImageProps } from 'react-native';

/**
 * `Image`, under a name.
 *
 * Called `Picture` rather than `Image` so the wrapper cannot collide with the
 * import it wraps -- a component named `Image` that renders `Image` is a file
 * that shadows itself, and the mistake compiles.
 *
 * This is React Native's `Image`, not `expo-image`'s. The app uses both; they
 * are different components with different props, and one name for the two
 * would be a substitution that changes what renders.
 */
export const Picture = (props: ImageProps) => <Image {...props} />;
