import { Box, Tappable } from '@/components/common';
import { useRouter } from 'expo-router';
import { Text, IconButton, Icon,  } from '@/components/common';
import { formatINR } from '@/lib/format';
import { type PriceRule } from '@/lib/pricing';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/inventory-pricing/styles';

export function PriceRuleRow({ rule }: { rule: PriceRule }) {
  const c = useColors();
  const router = useRouter();

  return (
    <Tappable
      onPress={() => router.push({ pathname: '/inventory/rule', params: { id: rule.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${rule.name}, ${rule.period}, ${formatINR(rule.amount)}. Edit`}
      style={({ pressed }) => [
        styles.ruleRow,
        { borderColor: c.borderCard, backgroundColor: c.surface, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Box style={styles.ruleBody}>
        <Text style={styles.ruleName}>{rule.name}</Text>
        <Text variant="badge" color="textSecondary" style={styles.rulePeriod}>
          {rule.period}
        </Text>
      </Box>

      <Text tabular style={styles.ruleAmount}>
        {formatINR(rule.amount)}
      </Text>
      <Icon name="edit" size={16} color={c.textTertiary} />

      <IconButton
        name="trash"
        label={`Delete ${rule.name}`}
        size={16}
        color={c.error}
        onPress={() => router.push({ pathname: '/inventory/delete-rule', params: { id: rule.id } })}
      />
    </Tappable>
  );
}
