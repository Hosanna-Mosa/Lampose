import { useEffect, useState } from 'react';
import { Box, Tappable } from '@/components/common';
import { useRouter } from 'expo-router';
import {
  Screen,
  Text,
  TextButton,
  IconButton,
  Icon,
  HeaderPill,
  EmptyState,
} from '@/components/common';
import { formatINR } from '@/lib/format';
import { ROOM_TYPES, type RoomType } from '@/lib/inventory';
import { BASE_PRICE, rulesFor, subscribePricing, type PriceRule } from '@/lib/pricing';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { PriceRuleRow } from '@/components/inventory-pricing/molecules/PriceRuleRow/PriceRuleRow';
import { styles } from '@/components/inventory-pricing/styles';

export function PricingScreen() {
  const c = useColors();
  const router = useRouter();

  const [roomType, setRoomType] = useState<RoomType>(ROOM_TYPES[0]);
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribePricing(() => setRevision((r) => r + 1)), []);

  const rules = rulesFor(roomType);
  const base = BASE_PRICE[roomType];

  return (
    <Screen
      contentStyle={styles.stack} key={revision}
      stickyHeader={
        <>
          <Box style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </Box>
        </>
      }
    >

      <Box style={styles.head}>
        <Text variant="screenTitle">Pricing</Text>
        <HeaderPill
          label={roomType}
          variant="sunken"
          onPress={() =>
            setRoomType((r) => ROOM_TYPES[(ROOM_TYPES.indexOf(r) + 1) % ROOM_TYPES.length])
          }
        />
      </Box>

      {/* Base price is pinned above the rules — everything below overrides it. */}
      <Tappable
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
        <Box style={styles.baseBody}>
          <Text variant="label" style={{ color: c.accentInk }}>
            Base price
          </Text>
          <Box style={styles.baseAmountRow}>
            <Text tabular style={[styles.baseAmount, { color: c.accentInkDeep }]}>
              {formatINR(base)}
            </Text>
            <Text style={[styles.perNight, { color: c.accentMuted }]}> / night</Text>
          </Box>
        </Box>
        <Box style={[styles.baseEdit, { backgroundColor: c.surface }]}>
          <Icon name="edit" size={16} color={c.accent} />
        </Box>
      </Tappable>

      <Box style={styles.sectionHead}>
        <Text variant="cardTitle">Seasonal &amp; weekend rules</Text>
        <TextButton
          label="+ Add rule"
          onPress={() => router.push({ pathname: '/inventory/rule', params: { room: roomType } })}
        />
      </Box>

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
