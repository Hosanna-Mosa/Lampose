import { View, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/common/utils/Skeleton.internal';
import { Skeleton } from '@/components/common/atoms/Skeleton';

export function SkeletonCard({ style }: { style?: ViewStyle }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderCard }, style]}>
      <View style={styles.row}>
        <Skeleton width="55%" height={14} />
        <Skeleton width={68} height={20} radius={10} />
      </View>
      <Skeleton width="40%" height={10} />
      <View style={[styles.rule, { backgroundColor: c.borderSubtle }]} />
      <View style={styles.row}>
        <Skeleton width="30%" height={10} />
        <Skeleton width="25%" height={14} />
      </View>
    </View>
  );
}
