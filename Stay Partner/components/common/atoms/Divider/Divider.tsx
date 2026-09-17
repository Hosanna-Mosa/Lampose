import { View, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/common/utils/Card.internal';

export function Divider({ style }: { style?: ViewStyle }) {
  const c = useColors();
  return <View style={[styles.divider, { backgroundColor: c.borderSubtle }, style]} />;
}
