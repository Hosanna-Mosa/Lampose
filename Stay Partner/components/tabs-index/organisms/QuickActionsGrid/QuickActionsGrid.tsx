import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/common/atoms/Icon';

type Props = {
  pendingCount?: number;
  openComplaintsCount?: number;
};

export function QuickActionsGrid({
  pendingCount = 0,
  openComplaintsCount = 0,
}: Props) {
  const router = useRouter();

  const actions = [
    {
      id: 'requests',
      title: `${pendingCount} pending requests`,
      subtitle: pendingCount > 0 ? 'Requires your response' : 'Nothing waiting on you',
      bg: '#FFF7ED',
      border: '#FFEDD5',
      discBg: '#FFEDD5',
      iconColor: '#EA580C',
      iconName: 'arrow-up' as const,
      onPress: () => router.push('/requests'),
    },
    {
      id: 'add-customer',
      title: 'Add a customer',
      subtitle: 'Log a walk-in and invite them to Lampose',
      bg: '#F0FDF4',
      border: '#DCFCE7',
      discBg: '#D1FAE5',
      iconColor: '#059669',
      iconName: 'plus' as const,
      onPress: () => router.push('/requests/add-customer'),
    },
    {
      id: 'refer',
      title: 'Refer & earn',
      subtitle: 'Invite an owner, get ₹100 when they join',
      bg: '#EFF6FF',
      border: '#DBEAFE',
      discBg: '#DBEAFE',
      iconColor: '#2563EB',
      iconName: 'users' as const,
      onPress: () => router.push('/referrals'),
    },
    {
      id: 'complaints',
      title: 'Complaints',
      subtitle: openComplaintsCount > 0 ? `${openComplaintsCount} open issues` : 'Nothing open right now',
      bg: '#FDF2F8',
      border: '#FCE7F3',
      discBg: '#FCE7F3',
      iconColor: '#E11D48',
      iconName: 'message' as const,
      onPress: () => router.push('/complaints'),
    },
  ];

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
      </View>

      {/* 2x2 Grid */}
      <View style={styles.grid}>
        {actions.map((item) => (
          <Pressable
            key={item.id}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: item.bg, borderColor: item.border },
              pressed && { opacity: 0.9 },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconDisc, { backgroundColor: item.discBg }]}>
                <Icon name={item.iconName} size={18} color={item.iconColor} />
              </View>
              <Icon name="chevron-right" size={16} color="#64748B" />
            </View>

            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text numberOfLines={2} style={styles.cardSubtitle}>
              {item.subtitle}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '48.2%',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    minHeight: 125,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconDisc: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 4,
  },
  cardSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 15,
    marginTop: 2,
  },
});
