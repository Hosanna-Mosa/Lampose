import type { Ref } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

/**
 * `ScrollView`, under a name -- and the one wrapper that must forward a ref.
 *
 * `app/support/ticket.tsx` holds `useRef<ScrollView>(null)` and calls
 * `scrollToEnd` on it when a message arrives. A wrapper that swallowed the ref
 * would leave `ref.current` null: the screen would render identically, every
 * screenshot would match, and the thread would simply stop scrolling to the
 * newest message. That is the class of fault no picture can see (§9), so it is
 * handled here rather than discovered later.
 *
 * Under React 19 `ref` arrives as an ordinary prop, so spreading `rest` onto
 * `ScrollView` forwards it. It is named in the type because `ScrollViewProps`
 * does not carry it, and an untyped ref is one somebody removes as unused.
 */
type Props = ScrollViewProps & { ref?: Ref<ScrollView> };

export const Scroller = ({ children, ...rest }: Props) => (
  <ScrollView {...rest}>{children}</ScrollView>
);
