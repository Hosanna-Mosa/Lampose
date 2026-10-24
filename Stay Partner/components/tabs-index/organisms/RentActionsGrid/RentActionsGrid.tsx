import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Icon, type IconName } from '@/components/common/atoms/Icon';
import { TiltTile } from '../../molecules/TiltTile/TiltTile';
import { formatINR } from '@/lib/format';
import type { RentOverview } from '@/services/api/rent.api';
import { flatCard } from '@/components/tabs-index/flat';

type Tile = {
  id: string;
  title: string;
  subtitle: string;
  bg: string;
  border: string;
  discBg: string;
  iconColor: string;
  iconName: IconName;
  href: string;
};

/**
 * The six things an owner does with rent, laid out like the Today tab's
 * Quick Actions — same card, same tints — so it reads as the same app. Each
 * subtitle carries a live number when there is one worth knowing.
 */
export function RentActionsGrid({ overview }: { overview: RentOverview | null }) {
  const router = useRouter();
  const counts = overview?.counts;
  const beds = overview?.beds;

  const owing = (counts?.overdue ?? 0) + (counts?.dueToday ?? 0);

  const tiles: Tile[] = [
    {
      id: 'residents',
      title: 'Your Residents',
      subtitle: counts
        ? `${counts.residents} living with you · add, find and manage`
        : 'Add, find and manage residents',
      bg: '#F0FDF4',
      border: '#DCFCE7',
      discBg: '#D1FAE5',
      iconColor: '#059669',
      iconName: 'users',
      href: '/rent/residents',
    },
    {
      id: 'due',
      title: 'Rent to Be Paid',
      subtitle: counts && owing > 0
        ? `${owing} owing · ${formatINR(counts.overdueAmount + counts.dueTodayAmount)}`
        : 'Due and overdue payments',
      bg: '#FFF7ED',
      border: '#FFEDD5',
      discBg: '#FFEDD5',
      iconColor: '#EA580C',
      iconName: 'wallet',
      href: '/rent/due',
    },
    {
      id: 'upcoming',
      title: 'Upcoming Rent',
      subtitle: counts && counts.upcoming > 0
        ? `${counts.upcoming} due in the next 7 days`
        : 'Next payment dates',
      bg: '#EFF6FF',
      border: '#DBEAFE',
      discBg: '#DBEAFE',
      iconColor: '#2563EB',
      iconName: 'calendar',
      href: '/rent/upcoming',
    },
    {
      id: 'history',
      title: 'Rent History',
      subtitle: overview && overview.collectedThisMonth.count > 0
        ? `${overview.collectedThisMonth.count} payment${overview.collectedThisMonth.count === 1 ? '' : 's'} this month`
        : 'Payments and receipts',
      bg: '#F5F3FF',
      border: '#EDE9FE',
      discBg: '#EDE9FE',
      iconColor: '#7C3AED',
      iconName: 'rupee',
      href: '/rent/history',
    },
    {
      id: 'vacancy',
      title: 'Vacancy',
      subtitle: beds && beds.total > 0
        ? `${beds.free} free · ${beds.occupied} occupied`
        : 'Available and occupied beds',
      bg: '#FFFBEB',
      border: '#FEF3C7',
      discBg: '#FEF3C7',
      iconColor: '#D97706',
      iconName: 'bed',
      href: '/rent/vacancy',
    },
    {
      id: 'reminders',
      title: 'Reminders',
      subtitle: 'Rent alerts and follow-ups',
      bg: '#FDF2F8',
      border: '#FCE7F3',
      discBg: '#FCE7F3',
      iconColor: '#E11D48',
      iconName: 'bell',
      href: '/rent/reminders',
    },
  ];

  /* Two per row, read left to right: Residents · Vacancy, Rent to Be Paid ·
     Upcoming Rent, Reminders · Rent History. */
  const ORDER = ['residents', 'vacancy', 'due', 'upcoming', 'reminders', 'history'];
  const ordered = ORDER.map((id) => tiles.find((t) => t.id === id)!).filter(Boolean);

  return (
    <View style={styles.grid}>
      {ordered.map((item, index) => (
        <TiltTile
          key={item.id}
          index={index}
          onPress={() => router.push(item.href as never)}
          accessibilityLabel={`${item.title}. ${item.subtitle}`}
          style={StyleSheet.flatten([styles.card, { backgroundColor: item.bg, borderColor: item.border }, flatCard])}
          headerStyle={styles.cardHeader}
          iconStyle={StyleSheet.flatten([styles.iconDisc, { backgroundColor: item.discBg }])}
          icon={<Icon name={item.iconName} size={18} color={item.iconColor} />}
          trailing={<Icon name="chevron-right" size={16} color="#64748B" />}
        >
          <View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text numberOfLines={2} style={styles.cardSubtitle}>
              {item.subtitle}
            </Text>
          </View>
        </TiltTile>
      ))}
    </View>
  );
}

/* The Quick Actions card, unchanged — see tabs-index/organisms/QuickActionsGrid. */
const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '48.2%',
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 125,
    /* A little lift, so the 3D tilt has something to cast. */
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
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
