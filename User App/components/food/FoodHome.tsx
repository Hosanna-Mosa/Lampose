import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

/**
 * Food home — DEV BUILD (`EXPO_PUBLIC_FOOD_MODE=dev`).
 *
 * The work-in-progress module screen, visible only behind the env gate.
 * Production users get `FoodComingSoon` instead; nothing here is final copy
 * or final data.
 *
 * Layout follows the confirmed design: the Stay explore screen's sibling —
 * search pill, quick chips, monthly plans first (priced /month like rent),
 * one-off orders second. The veg / non-veg mark holds the slot the gender
 * badge holds on stay cards: same class of fact, a wrong tap is a wasted
 * trip. Everything is mock data until the backend module exists.
 */

type Provider = {
  id: string;
  name: string;
  veg: boolean;
  meta: string;
  today?: string;
  price: number;
  per: 'month' | 'meal';
  trial?: string;
  tone: [string, string];
};

/** Mock only — the real list comes from the (not yet built) food API. */
const PLANS: readonly Provider[] = [
  {
    id: 'annapurna',
    name: 'Annapurna Tiffins',
    veg: true,
    meta: 'Delivers to your PG · dinner 7:30–9 pm',
    today: 'Today: phulka, dal tadka, jeera rice, curd',
    price: 2600,
    per: 'month',
    trial: '₹90 trial meal',
    tone: ['#7d8d7b', '#3f5340'],
  },
  {
    id: 'srisai',
    name: 'Sri Sai Mess',
    veg: false,
    meta: '2 min walk · lunch & dinner · Sunday chicken',
    today: 'Today: veg meals + egg curry option',
    price: 3200,
    per: 'month',
    tone: ['#8d857b', '#534b3f'],
  },
];

const ONE_OFF: readonly Provider[] = [
  {
    id: 'gharka',
    name: 'Ghar Ka Khana',
    veg: true,
    meta: 'Delivers in 40 min · min order ₹120',
    price: 110,
    per: 'meal',
    tone: ['#6d7b8d', '#3a4553'],
  },
];

/** The standard square mark: shape + word, never colour alone. */
function VegMark({ veg }: { veg: boolean }) {
  const { colors } = useTheme();
  const ink = veg ? colors.success.ink : colors.danger.ink;
  return (
    <View style={[styles.vegMark, { borderColor: ink, backgroundColor: colors.surface }]}>
      <View style={[styles.vegDot, { backgroundColor: ink }]} />
    </View>
  );
}

function ProviderCard({ provider }: { provider: Provider }) {
  const { colors, space, radius } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card },
      ]}
    >
      <View style={[styles.photo, { backgroundColor: provider.tone[0] }]}>
        <View style={styles.markRow}>
          <VegMark veg={provider.veg} />
          <Text variant="numMeta" style={styles.markLabel}>
            {provider.veg ? 'PURE VEG' : 'NON-VEG'}
          </Text>
        </View>
      </View>
      <View style={{ padding: space[3], gap: space[1] }}>
        <Text variant="title3">{provider.name}</Text>
        <Text variant="caption" color="tertiary">
          {provider.meta}
        </Text>
        {provider.today ? (
          <Text variant="caption" color="secondary">
            {provider.today}
          </Text>
        ) : null}
        <View style={styles.priceRow}>
          <Text variant="priceMd">
            ₹{provider.price.toLocaleString('en-IN')}
            <Text variant="numMeta" color="tertiary">
              /{provider.per}
            </Text>
          </Text>
          {provider.trial ? (
            <View
              style={[
                styles.trial,
                {
                  backgroundColor: colors.warning.tint,
                  borderColor: colors.warning.border,
                  borderRadius: radius.chip,
                },
              ]}
            >
              <Text variant="numMeta" style={{ color: colors.warning.ink }}>
                {provider.trial}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function FoodHome() {
  const { colors, space, layout, radius } = useTheme();

  return (
    <ScrollView
      contentContainerStyle={{ paddingVertical: space[4], paddingBottom: space[8], gap: space[4] }}
      showsVerticalScrollIndicator={false}
    >
      {/* The gate, said out loud. This banner is the difference between "the
          module shipped half-done" and "I am looking at the dev build". */}
      <View
        style={[
          styles.devBanner,
          {
            marginHorizontal: layout.gutter,
            backgroundColor: colors.danger.tint,
            borderColor: colors.danger.border,
            borderRadius: radius.chip,
            padding: space[2],
            gap: space[2],
          },
        ]}
      >
        <Icon name="alert" size={16} color={colors.danger.ink} />
        <Text variant="caption" style={{ color: colors.danger.ink, flex: 1 }}>
          Food module — in development. Production shows "coming soon"
          (EXPO_PUBLIC_FOOD_MODE).
        </Text>
      </View>

      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Search tiffins and messes"
        style={[
          styles.search,
          {
            marginHorizontal: layout.gutter,
            backgroundColor: colors.surface,
            borderColor: colors.textPrimary,
            borderRadius: radius.pill,
            paddingHorizontal: space[4],
            gap: space[3],
          },
        ]}
      >
        <Icon name="search" size={20} color={colors.textPrimary} />
        <Text variant="body" color="tertiary">
          Search tiffins and messes
        </Text>
      </Pressable>

      <View style={[styles.chips, { paddingHorizontal: layout.gutter, gap: space[2] }]}>
        <View
          style={[
            styles.chip,
            {
              backgroundColor: colors.brandTint,
              borderColor: colors.brandInk,
              borderRadius: radius.chip,
            },
          ]}
        >
          <Icon name="check" size={16} color={colors.brandInk} />
          <Text variant="label" style={{ color: colors.brandInk, letterSpacing: 0 }}>
            Veg only
          </Text>
        </View>
        {['Price', 'Meals/day', 'Filters'].map((label) => (
          <View
            key={label}
            style={[
              styles.chip,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderInput,
                borderRadius: radius.chip,
              },
            ]}
          >
            <Text variant="caption" color="secondary">
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ gap: space[3] }}>
        <View style={[styles.sectionRow, { paddingHorizontal: layout.gutter }]}>
          <Text variant="title2">Monthly tiffin plans</Text>
          <Text variant="numMeta" color="tertiary">
            {PLANS.length} near you
          </Text>
        </View>
        <View style={{ paddingHorizontal: layout.gutter, gap: space[3] }}>
          {PLANS.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </View>
      </View>

      <View style={{ gap: space[3] }}>
        <View style={[styles.sectionRow, { paddingHorizontal: layout.gutter }]}>
          <Text variant="title2">Order once tonight</Text>
          <Text variant="numMeta" color="tertiary">
            No plan needed
          </Text>
        </View>
        <View style={{ paddingHorizontal: layout.gutter, gap: space[3] }}>
          {ONE_OFF.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  devBanner: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  search: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderWidth: 2 },
  chips: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  photo: { height: 120 },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 6, margin: 8 },
  markLabel: { color: '#FFFFFF', fontSize: 9, letterSpacing: 0.8 },
  vegMark: {
    width: 16,
    height: 16,
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vegDot: { width: 7, height: 7, borderRadius: 999 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  trial: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 7, paddingVertical: 2 },
});
