import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/common/atoms/Icon';
import { flatCard } from '@/components/tabs-index/flat';

type Props = {
  today?: string;
  week?: string;
  onPress?: () => void;
};

export function EarningsMiniCard({ today = '₹0', week = '₹0', onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardContainer, flatCard, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel="Payouts"
    >
      <View style={styles.topRow}>
        <View style={styles.iconDisc}>
          <Icon name="wallet" size={16} color="#059669" />
        </View>
        <View style={styles.textCol}>
          {/* "Payouts", not "Earnings": the figures are completed payouts — money
              Lampose sent — not what the owner earned. Rent paid to the owner
              directly never passes through Lampose to be counted. */}
          <Text numberOfLines={1} style={styles.cardTitle}>Payouts</Text>
          <Text numberOfLines={1} style={styles.metricValue}>{today}</Text>
        </View>
        <Icon name="chevron-right" size={16} color="#059669" />
      </View>

      <Text numberOfLines={1} style={styles.subtext}>
        Paid today: {today}  <Text style={styles.dividerPipe}>|</Text>  This week: {week}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* Compact and rectangular: icon, title and figure on one line, the detail
     under it — about half the height of the old square card. */
  cardContainer: {
    flex: 1,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconDisc: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#065F46',
  },
  metricValue: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '800',
    color: '#064E3B',
  },
  subtext: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
  },
  dividerPipe: {
    color: '#CBD5E1',
  },
});
