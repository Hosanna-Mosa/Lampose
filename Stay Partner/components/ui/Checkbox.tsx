import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Labelled checkbox for confirmation checklists. The whole row is the target,
 * padded to 44px — the 20px box alone would be far under.
 */
export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const c = useColors();

  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : disabled ? 0.5 : 1 }]}
    >
      <View
        style={[
          styles.box,
          {
            backgroundColor: checked ? c.accent : 'transparent',
            borderColor: checked ? c.accent : c.border,
          },
        ]}
      >
        {checked ? <Icon name="check" size={11} color={c.white} strokeWidth={3} /> : null}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: radius.sm - 1,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18, flex: 1 },
});
