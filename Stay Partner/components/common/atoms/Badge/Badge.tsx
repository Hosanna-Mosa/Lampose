import { View, type ViewStyle } from 'react-native';
import { Text } from '@/components/common/atoms/Text';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/common/utils/Badge.internal';

export function Badge({
  label,
  tone = 'neutral',
  style,
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info';
  style?: ViewStyle;
}) {
  const c = useColors();
  const map = {
    neutral: { fg: c.textSecondary, bg: c.borderSubtle },
    accent: { fg: c.accent, bg: c.accentTint },
    success: { fg: c.successOnTint, bg: c.successTint },
    warning: { fg: c.warningOnTint, bg: c.warningTint },
    error: { fg: c.error, bg: c.errorTint },
    info: { fg: c.info, bg: c.infoTint },
  } as const;
  const s = map[tone];

  return (
    <View style={[styles.pill, { backgroundColor: s.bg }, style]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{label}</Text>
    </View>
  );
}
