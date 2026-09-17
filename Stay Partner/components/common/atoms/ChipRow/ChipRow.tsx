import { View, type ViewStyle } from 'react-native';
import { styles } from '@/components/common/utils/Chip.internal';

export function ChipRow({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}
