import { Image, type ImageProps } from "react-native";

/** `Image`, with a name — chosen so it cannot collide with the import it wraps. */
export const Picture = (props: ImageProps) => <Image {...props} />;
