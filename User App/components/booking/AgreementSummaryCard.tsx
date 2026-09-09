import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { AgreementClause } from '@/types/booking';
import { actions } from '@/constants/actions';

export type AgreementSummaryCardProps = {
  propertyLine: string;
  clauses: readonly AgreementClause[];
  houseRules: readonly string[];
  /** The consequence of repeatedly breaking them, stated in days. */
  houseRulesNote?: string;
  onSendToParent?: () => void;
  onOpenPdf?: () => void;
};

export function AgreementSummaryCard({
  propertyLine,
  clauses,
  houseRules,
  houseRulesNote,
  onSendToParent,
  onOpenPdf,
}: AgreementSummaryCardProps) {
  const { colors, space, radius } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.card,
        padding: space[4],
        gap: space[4],
      }}
    >
      <View style={{ gap: space[1] }}>
        <Text variant="title2">What you&apos;re agreeing to</Text>
        <Text variant="caption" color="secondary">
          {propertyLine}
        </Text>
      </View>

      <View>
        {clauses.map((clause, index) => (
          <View
            key={clause.heading}
            style={{
              paddingVertical: space[3],
              borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: colors.borderSubtle,
              gap: space[1],
            }}
          >
            <View style={[styles.headingRow, { gap: space[3] }]}>
              <Text variant="bodyStrong" style={styles.flex}>
                {clause.heading}
              </Text>
              {/* The market term rides alongside so it is learned, not required. */}
              {clause.term ? (
                <Text variant="label" color="tertiary">
                  {clause.term}
                </Text>
              ) : null}
              {clause.refundable ? (
                <View
                  style={{
                    backgroundColor: colors.warning.tint,
                    borderRadius: radius.chip,
                    paddingHorizontal: space[2],
                    paddingVertical: 2,
                  }}
                >
                  <Text variant="label" style={{ color: colors.warning.ink }}>
                    Refundable
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="body" color="secondary">
              {clause.body}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ gap: space[2] }}>
        <Text variant="title3">House rules you&apos;re accepting</Text>
        <View style={[styles.ruleWrap, { gap: space[2] }]}>
          {houseRules.map((rule) => (
            <View
              key={rule}
              style={{
                backgroundColor: colors.surfaceSunken,
                borderRadius: radius.chip,
                paddingHorizontal: space[3],
                paddingVertical: space[2],
              }}
            >
              <Text variant="caption" color="secondary">
                {rule}
              </Text>
            </View>
          ))}
        </View>
        {houseRulesNote ? (
          <Text variant="caption" color="secondary">
            {houseRulesNote}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: space[2] }}>
        {onSendToParent ? (
          <Button label={actions.sendToParent} variant="secondary" fullWidth onPress={onSendToParent} />
        ) : null}
        {onOpenPdf ? (
          <Button label="Full agreement PDF" variant="ghost" fullWidth onPress={onOpenPdf} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  flex: { flex: 1 },
  ruleWrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
