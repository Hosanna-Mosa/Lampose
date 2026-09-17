import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/common/utils/Field.internal';

export function FieldBox({
  children,
  focused,
  invalid,
  disabled,
  height = 52,
  align = 'center',
  style,
}: {
  children: ReactNode;
  focused?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  height?: number;
  align?: 'center' | 'flex-start';
  style?: ViewStyle;
}) {
  const c = useColors();

  const borderColor = invalid ? c.error : focused ? c.accent : disabled ? c.borderSubtle : c.border;
  const ringColor = focused && !invalid ? c.accentTint : 'transparent';

  return (
    <View style={[styles.ring, { borderColor: ringColor }, style]}>
      <View
        style={[
          styles.box,
          {
            borderColor,
            backgroundColor: disabled ? c.surfaceSunken : c.surface,
            minHeight: height,
            alignItems: align,
            paddingVertical: align === 'flex-start' ? 14 : 0,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}
