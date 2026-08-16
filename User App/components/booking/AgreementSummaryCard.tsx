import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { AgreementClause } from '@/types/booking';
import { actions } from '@/constants/actions';

/**
 * What a first-time renter actually signs, in plain language.
 *
 * The writing rules are the component:
 *
 *  - Every heading is a sentence about the user, not a field name. "You pay
 *    ₹8,500 every month", never "Monthly rent: ₹8,500".
 *  - The market term still appears, as the right-hand label, so the student
 *    learns the vocabulary without needing it in order to understand. That is
 *    the teaching mechanism for the whole product.
 *  - Every clause states its consequence in rupees or days, with a real date
 *    computed from the move-in date. Never "as per terms".
 *  - Lock-in and notice period are separated, because being asked to confuse
 *    them is how students lose a month's rent.
 *  - The deposit clause names what can be deducted and what cannot.
 *  - "Send to my parent" is a first-class action, not a share sheet — somebody
 *    else is usually paying, and they will ask.
 *
 * No legalese, no "lessee", no "hereinafter". The PDF can be formal; this card
 * is the version that gets read.
 */

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
