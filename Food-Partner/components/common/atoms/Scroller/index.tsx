import { forwardRef } from "react";
import { ScrollView, type ScrollViewProps } from "react-native";

/**
 * `ScrollView`, with a name.
 *
 * It FORWARDS ITS REF, and that is not optional. The support thread at
 * `support-reference` holds a ref to scroll itself to the newest message — the
 * only `ref=` on a primitive anywhere in the screens. A plain function wrapper
 * would swallow it silently: nothing would error, the thread would simply stop
 * scrolling, and no snapshot or screenshot would catch it because the failure
 * only appears once a message arrives.
 */
export const Scroller = forwardRef<ScrollView, ScrollViewProps>(({ children, ...rest }, ref) => (
  <ScrollView ref={ref} {...rest}>
    {children}
  </ScrollView>
));

Scroller.displayName = "Scroller";
