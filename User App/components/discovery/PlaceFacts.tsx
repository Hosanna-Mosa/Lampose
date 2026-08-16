import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Icon, Text, Tooltip } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { HouseRule, MealPlan } from '@/types/listing';

/* ------------------------------------------------------------------ *
 * MealPlanCard
 * ------------------------------------------------------------------ */

export type MealPlanCardProps = { plan: MealPlan };

/**
 * Timings matter more than the meal count.
 *
 * A 7:30 am breakfast is unusable for a student with a 9 am class across town,
 * so every slot shows its window — and a meal that is not served says so,
 * rather than being left blank for the reader to interpret.
 */
export function MealPlanCard({ plan }: MealPlanCardProps) {
  const { colors, space, radius } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.card,
        padding: space[4],
        gap: space[3],
      }}
    >
      <View style={[styles.row, { gap: space[3] }]}>
        <Icon name="mess" size={24} color={colors.textPrimary} />
        <View style={styles.flex}>
          <Text variant="title3">
            {plan.included
              ? `${plan.mealsPerDay} ${plan.mealsPerDay === 1 ? 'meal' : 'meals'} a day included in rent`
              : 'No meals included'}
          </Text>
          <Text variant="numMeta" color="secondary">
            {plan.dietary}
          </Text>
        </View>
      </View>

      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />

      <View style={{ gap: space[2] }}>
        {plan.slots.map((slot) => (
          <View key={slot.label} style={styles.slotRow}>
            <Text variant="body" color={slot.window ? 'primary' : 'tertiary'}>
              {slot.label}
            </Text>
            <Text variant={slot.window ? 'priceSm' : 'numMeta'} color={slot.window ? 'primary' : 'tertiary'}>
              {slot.window ?? 'not served'}
            </Text>
          </View>
        ))}
      </View>

      {plan.note ? (
        <Text variant="caption" color="secondary">
          {plan.note}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * HouseRulesRow
 * ------------------------------------------------------------------ */

export type HouseRulesRowProps = { rules: readonly HouseRule[] };

/**
 * The terms of a place, stated as facts.
 *
 * No red, no ✕ glyphs, no "restrictions" heading. A 10:30 gate is a dealbreaker
 * for one student and irrelevant to another, and the UI does not get to decide
 * which. Terms with a glossary entry carry the dotted underline.
 */
export function HouseRulesRow({ rules }: HouseRulesRowProps) {
  const { colors, space } = useTheme();

  return (
    <View>
      {rules.map((rule, index) => (
        <View
          key={rule.label}
          style={[
            styles.ruleRow,
            {
              paddingVertical: space[3],
              borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: colors.borderSubtle,
              gap: space[4],
            },
          ]}
        >
          <Text variant="body" color="secondary" style={styles.ruleLabel}>
            {rule.label}
          </Text>
          {rule.glossary ? (
            <View style={styles.flex}>
              <Tooltip term={rule.value} title={rule.glossary.title} body={rule.glossary.body} />
            </View>
          ) : (
            <Text variant="bodyStrong" style={styles.flex}>
              {rule.value}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  slotRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  // Same reason as Visits' fieldLabel — a fixed column and scaled text
  // cannot both be honoured.
  ruleLabel: { minWidth: 96, flexShrink: 0 },
});
