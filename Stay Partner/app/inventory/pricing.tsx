import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Text,
  TextButton,
  IconButton,
  Icon,
  HeaderPill,
  EmptyState,
} from '@/components/ui';
import { formatINR } from '@/lib/format';
import { ROOM_TYPES, type RoomType } from '@/lib/inventory';
import { BASE_PRICE, rulesFor, subscribePricing, type PriceRule } from '@/lib/pricing';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

export default function PricingScreen() {
  const c = useColors();
  const router = useRouter();

  const [roomType, setRoomType] = useState<RoomType>(ROOM_TYPES[0]);
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribePricing(() => setRevision((r) => r + 1)), []);

  const rules = rulesFor(roomType);
  const base = BASE_PRICE[roomType];

  return (
    <Screen contentStyle={styles.stack} key={revision}>
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <View style={styles.head}>
        <Text variant="screenTitle">Pricing</Text>
        <HeaderPill
          label={roomType}
          variant="sunken"
          onPress={() =>
            setRoomType((r) => ROOM_TYPES[(ROOM_TYPES.indexOf(r) + 1) % ROOM_TYPES.length])
          }
        />
      </View>

      {/* Base price is pinned above the rules — everything below overrides it. */}
      <Pressable
        onPress={() =>
          router.push({ pathname: '/inventory/base-price', params: { room: roomType } })
        }
        accessibilityRole="button"
        accessibilityLabel={`Base price ${formatINR(base)} per night. Edit`}
        style={({ pressed }) => [
          styles.baseCard,
          { backgroundColor: c.accentTint, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={styles.baseBody}>
          <Text variant="label" style={{ color: c.accentInk }}>
            Base price
          </Text>
          <View style={styles.baseAmountRow}>
            <Text tabular style={[styles.baseAmount, { color: c.accentInkDeep }]}>
              {formatINR(base)}
            </Text>
            <Text style={[styles.perNight, { color: c.accentMuted }]}> / night</Text>
          </View>
        </View>
        <View style={[styles.baseEdit, { backgroundColor: c.surface }]}>
          <Icon name="edit" size={16} color={c.accent} />
        </View>
      </Pressable>

      <View style={styles.sectionHead}>
        <Text variant="cardTitle">Seasonal &amp; weekend rules</Text>
        <TextButton
          label="+ Add rule"
          onPress={() => router.push({ pathname: '/inventory/rule', params: { room: roomType } })}
        />
      </View>

      {rules.length > 0 ? (
        rules.map((rule) => <PriceRuleRow key={rule.id} rule={rule} />)
      ) : (
        <EmptyState
          icon="rupee"
          title="No rules yet"
          body="Add a rule to charge more at weekends or during a festival week."
          style={styles.empty}
        />
      )}
    </Screen>
  );
}

/**
 * The design puts a 16px edit icon next to a 16px delete icon, ten pixels apart.
 * Simply enlarging both would make the two targets touch, so a tap that lands
 * between them could destroy a rule instead of opening it.
 *
 * Instead the whole row opens the editor — the pencil labels that, rather than
 * being its own small target — and delete is the one separated 44px control.
 */
function PriceRuleRow({ rule }: { rule: PriceRule }) {
  const c = useColors();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/inventory/rule', params: { id: rule.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${rule.name}, ${rule.period}, ${formatINR(rule.amount)}. Edit`}
      style={({ pressed }) => [
        styles.ruleRow,
        { borderColor: c.borderCard, backgroundColor: c.surface, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View style={styles.ruleBody}>
        <Text style={styles.ruleName}>{rule.name}</Text>
        <Text variant="badge" color="textSecondary" style={styles.rulePeriod}>
          {rule.period}
        </Text>
      </View>

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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -8 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  baseCard: {
    borderRadius: radius.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  baseBody: { flex: 1, gap: 4 },
  baseAmountRow: { flexDirection: 'row', alignItems: 'baseline' },
  baseAmount: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 30 },
  perNight: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  baseEdit: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: -6,
  },
  ruleRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ruleBody: { flex: 1, paddingVertical: 6 },
  ruleName: { fontFamily: fonts.bold, fontSize: 13.5, lineHeight: 18 },
  rulePeriod: { fontSize: 11.5, marginTop: 3 },
  ruleAmount: { fontFamily: fonts.extrabold, fontSize: 15, lineHeight: 20 },
  empty: { minHeight: 220 },
});
