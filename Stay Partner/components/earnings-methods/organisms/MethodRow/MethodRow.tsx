import { Box, Tappable } from '@/components/common';
import { Text, Icon, Badge } from '@/components/common';
import { maskedNumber, type PayoutMethod } from '@/lib/payouts';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/earnings-methods/styles';

export function MethodRow({ method, onPress }: { method: PayoutMethod; onPress?: () => void }) {
  const c = useColors();
  const isDefault = method.isDefault;

  const content = (
    <>
      <Box
        style={[
          styles.tile,
          { backgroundColor: isDefault ? c.accentTint : c.surfaceSunken },
        ]}
      >
        <Icon name="bank" size={18} color={isDefault ? c.accent : c.textSecondary} />
      </Box>
      <Box style={styles.body}>
        <Text style={styles.bank}>{method.bankName}</Text>
        <Text variant="badge" color="textSecondary" tabular style={styles.number}>
          {maskedNumber(method)}
        </Text>
      </Box>
      {isDefault ? (
        <Badge label="Default" tone="accent" style={styles.defaultBadge} />
      ) : (
        <Icon name="chevron-right" size={14} color={c.textTertiary} strokeWidth={2} />
      )}
    </>
  );

  const skin = {
    borderWidth: isDefault ? 1.5 : 1,
    borderColor: isDefault ? c.accent : c.borderCard,
    backgroundColor: c.surface,
  };

  if (!onPress) {
    return <Box style={[styles.row, skin]}>{content}</Box>;
  }

  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${method.bankName} ending ${method.last4}. Options`}
      style={({ pressed }) => [styles.row, skin, { opacity: pressed ? 0.75 : 1 }]}
    >
      {content}
    </Tappable>
  );
}
