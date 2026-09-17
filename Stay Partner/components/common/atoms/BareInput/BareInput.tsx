import { TextInput, type TextInputProps } from 'react-native';

/**
 * `TextInput`, unstyled, under a name.
 *
 * `BareInput`, not `Input`: `components/ui/Input` already exists and is the
 * STYLED field -- border, label, error text. The one bare `TextInput` left in
 * `app/` is the support-thread composer, which is deliberately unstyled
 * because it sits inside its own send-row. Giving both the same name would
 * make the swap a restyle.
 */
export const BareInput = (props: TextInputProps) => <TextInput {...props} />;
