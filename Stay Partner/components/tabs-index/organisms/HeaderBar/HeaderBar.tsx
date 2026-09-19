import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/common/atoms/Icon';

type Props = {
  propertyName: string;
  locationLabel?: string;
  unreadCount?: number;
  ownerName?: string | null;
  onPressProperty?: () => void;
};

export function HeaderBar({
  propertyName,
  locationLabel = 'Rajahmundry, AP',
  unreadCount = 0,
  ownerName,
  onPressProperty,
}: Props) {
  const router = useRouter();

  const propertyInitial = propertyName ? propertyName.charAt(0).toUpperCase() : 'A';
  const ownerInitial = ownerName ? ownerName.charAt(0).toUpperCase() : 'D';

  return (
    <View style={styles.container}>
      {/* Left Pill Card: Avatar + Property Name + Chevron + Location */}
      <Pressable
        onPress={onPressProperty}
        style={({ pressed }) => [styles.propertyPill, pressed && { opacity: 0.88 }]}
      >
        <View style={styles.avatarDisc}>
          <Text style={styles.avatarInitial}>{propertyInitial}</Text>
        </View>

        <View style={styles.propertyTextCol}>
          <View style={styles.propertyNameRow}>
            <Text numberOfLines={1} style={styles.propertyName}>
              {propertyName}
            </Text>
            <Icon name="chevron-down" size={16} color="#1E293B" />
          </View>
          <Text numberOfLines={1} style={styles.propertyLocation}>
            {locationLabel}
          </Text>
        </View>
      </Pressable>

      {/* Right Controls: Notification Bell + Owner Avatar */}
      <View style={styles.rightControls}>
        <Pressable
          onPress={() => router.push('/notifications')}
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Icon name="bell" size={18} color="#0F172A" />
          {unreadCount > 0 ? <View style={styles.unreadDot} /> : null}
        </Pressable>

        <Pressable
          onPress={() => router.push('/settings/profile')}
          style={({ pressed }) => [styles.ownerAvatar, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.ownerInitial}>{ownerInitial}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 4,
  },
  propertyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 2,
    paddingHorizontal: 0,
    maxWidth: '72%',
  },
  avatarDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarInitial: {
    fontSize: 15,
    fontWeight: '700',
    color: '#065F46',
  },
  propertyTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  propertyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  propertyName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  propertyLocation: {
    fontSize: 11,
    color: '#64748B',
    marginTop: -1,
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  ownerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerInitial: {
    fontSize: 15,
    fontWeight: '700',
    color: '#065F46',
  },
});
