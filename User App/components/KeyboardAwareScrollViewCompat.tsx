import { Platform, ScrollView, ScrollViewProps } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

/**
 * A scroll view that keeps the focused field above the keyboard.
 *
 * Every form in this app is a `ScrollView` with fields in it, and a plain one
 * does nothing when the keyboard opens: on a 6" phone the keyboard takes the
 * bottom half of the screen, so anything below the fold is typed into blind.
 * That is not a hypothetical — the mobile number on the sign-up screen sits
 * under the name and the email, and it was completely hidden while being
 * filled in.
 *
 * This component existed for exactly that and was imported by nothing. It is
 * wired into the form screens now.
 *
 * Web falls back to a plain `ScrollView` because a browser scrolls a focused
 * input into view on its own, and the native module has no business there.
 */

type Props = KeyboardAwareScrollViewProps & ScrollViewProps;

/**
 * How much room to leave between the caret and the keyboard.
 *
 * The library's default is `0`, which lines the caret up exactly with the top
 * of the keyboard — the field is then technically visible and everything
 * underneath it is not. In this app what sits underneath is the part that
 * matters: `TextField` renders its helper below the input, and swaps in the
 * error there when validation fails. "Indian mobile numbers start with 6, 7,
 * 8 or 9" is two lines of guidance that appears exactly when somebody is
 * stuck, in the one position a zero offset guarantees they cannot see.
 *
 * 80 clears the lower half of a field plus two lines of caption. Scrolling a
 * little further than strictly needed costs nothing; stopping short costs the
 * error message.
 */
const CARET_TO_KEYBOARD = 80;

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = 'handled',
  bottomOffset = CARET_TO_KEYBOARD,
  ...props
}: Props) {
  if (Platform.OS === 'web') {
    return (
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
        {children}
      </ScrollView>
    );
  }
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      bottomOffset={bottomOffset}
      /* The screen stays where it is when the keyboard closes. Springing back
         to the top the instant a field is dismissed loses the reader's place
         on a form they are halfway through. */
      disableScrollOnKeyboardHide
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
