import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Icon } from '@/components/common/atoms/Icon';

type Props = {
  onPress?: () => void;
};

export function ReferEarnBanner({ onPress }: Props) {
  return (
    <View style={styles.bannerContainer}>
      {/* 3D Gift Box Graphic */}
      <View style={styles.giftGraphicWrap}>
        <Svg width={46} height={46} viewBox="0 0 46 46" fill="none">
          {/* Shadow */}
          <Rect x="4" y="38" width="38" height="4" rx="2" fill="#A7F3D0" opacity="0.6" />
          {/* Gift Box Base */}
          <Rect x="7" y="18" width="32" height="20" rx="3" fill="#059669" />
          {/* Lid */}
          <Rect x="5" y="13" width="36" height="7" rx="2" fill="#10B981" />
          {/* Yellow Ribbon Vertical */}
          <Rect x="20" y="13" width="6" height="25" fill="#F59E0B" />
          {/* Yellow Ribbon Horizontal */}
          <Rect x="7" y="25" width="32" height="5" fill="#F59E0B" />
          {/* Bow Left */}
          <Path d="M17 13C17 13 13 8 18 6C21 8 20 13 20 13Z" fill="#FBBF24" />
          {/* Bow Right */}
          <Path d="M29 13C29 13 33 8 28 6C25 8 26 13 26 13Z" fill="#FBBF24" />
          {/* Center Bow Knot */}
          <Rect x="19" y="11" width="8" height="4" rx="2" fill="#D97706" />
        </Svg>
      </View>

      <View style={styles.textCol}>
        <Text style={styles.title}>Refer &amp; Earn ₹100</Text>
        <Text numberOfLines={2} style={styles.subtext}>
          Invite another property owner to Lampose and get rewarded when they join.
        </Text>
      </View>

      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}
      >
        <Text style={styles.btnText}>Invite Now</Text>
        <Icon name="chevron-right" size={14} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  giftGraphicWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  textCol: {
    flex: 1,
    paddingRight: 6,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#065F46',
  },
  subtext: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
    lineHeight: 15,
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
