import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/common/atoms/Icon';

type Props = {
  today?: string;
  week?: string;
  onPress?: () => void;
};

export function EarningsMiniCard({ today = '₹0', week = '₹0', onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardContainer, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel="Earnings"
    >
      <View style={styles.topRow}>
        <View style={styles.iconDisc}>
          <Icon name="wallet" size={18} color="#059669" />
        </View>

        <View style={styles.chevronDisc}>
          <Icon name="chevron-right" size={16} color="#059669" />
        </View>
      </View>

      <Text style={styles.cardTitle}>Earnings</Text>
      <Text style={styles.metricValue}>{today}</Text>

      <Text numberOfLines={1} style={styles.subtext}>
        Today: {today}  <Text style={styles.dividerPipe}>|</Text>  This week: {week}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flex: 1,
    backgroundColor: '#F0FDF4',
    borderRadius: 20,
    padding: 16,
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
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconDisc: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronDisc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#065F46',
    marginTop: 2,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#064E3B',
    marginVertical: 2,
  },
  subtext: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  dividerPipe: {
    color: '#CBD5E1',
  },
});
