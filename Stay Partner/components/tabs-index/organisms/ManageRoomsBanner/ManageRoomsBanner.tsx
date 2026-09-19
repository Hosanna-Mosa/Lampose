import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/common/atoms/Icon';

type Props = {
  onPress?: () => void;
};

export function ManageRoomsBanner({ onPress }: Props) {
  return (
    <View style={styles.bannerContainer}>
      <View style={styles.iconDisc}>
        <Icon name="arrow-up" size={18} color="#059669" />
      </View>

      <View style={styles.textCol}>
        <Text style={styles.title}>Keep your rooms updated</Text>
        <Text style={styles.subtext}>Update availability, photos and more</Text>
      </View>

      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}
      >
        <Text style={styles.btnText}>Manage Rooms</Text>
        <Icon name="chevron-right" size={14} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  iconDisc: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textCol: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtext: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064E3B',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
    gap: 4,
  },
  btnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
