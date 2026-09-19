import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Switch } from '@/components/common/atoms/Switch';
import { Icon } from '@/components/common/atoms/Icon';

type Props = {
  greetingText: string;
  owner: string | null;
  available: boolean;
  onToggleAvailable: (next: boolean) => void;
};

export function HeroCard({
  greetingText,
  owner,
  available,
  onToggleAvailable,
}: Props) {
  const ownerName = owner?.trim() || 'Partner';

  return (
    <View style={styles.cardContainer}>
      <LinearGradient
        colors={['#064430', '#074E37', '#043424']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBg}
      >
        {/* Background Building Image spanning full container with smooth gradient mask */}
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Image
            source={require('@/assets/images/hero-building.jpg')}
            style={styles.fullBuildingImage}
            resizeMode="cover"
          />
          {/* Horizontal multi-step gradient mask: Solid dark green on left -> transparent on right */}
          <LinearGradient
            colors={[
              '#064430',
              '#064430',
              'rgba(6, 68, 48, 0.92)',
              'rgba(7, 78, 55, 0.65)',
              'rgba(6, 68, 48, 0.25)',
              'transparent',
            ]}
            locations={[0, 0.35, 0.52, 0.68, 0.85, 1.0]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* Top Right Decorative Script Text */}
        <View style={styles.scriptContainer}>
          <Text style={styles.scriptText}>Better Stays</Text>
          <Text style={[styles.scriptText, { marginTop: -4 }]}>Happier Days</Text>
        </View>

        {/* Left Content Area */}
        <View style={styles.leftContent}>
          <Text style={styles.greetingLabel}>{greetingText},</Text>
          <Text style={styles.ownerNameText}>
            {ownerName} <Text style={styles.sunEmoji}>☀️</Text>
          </Text>
          <Text style={styles.heroSubtitle}>
            Manage your property,{'\n'}serve better stays.
          </Text>

          {/* Embedded Availability Toggle Card */}
          <View style={styles.toggleCard}>
            <View style={styles.toggleCardTop}>
              <View style={styles.toggleDotDisc}>
                <View style={[styles.toggleDot, { backgroundColor: available ? '#10B981' : '#94A3B8' }]} />
              </View>

              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleTitle}>
                  {available ? 'Rooms available for booking' : 'Rooms offline'}
                </Text>
                <Text style={styles.toggleSubtext}>
                  {available ? 'Visible to users on Lampose' : 'Not visible for new bookings'}
                </Text>
              </View>

              <Switch
                value={available}
                onChange={onToggleAvailable}
                size="sm"
                accessibilityLabel="Rooms available for booking"
              />
            </View>

            {/* Bottom Status Message */}
            <View style={styles.toggleCardBottom}>
              <View style={[styles.checkDisc, { backgroundColor: available ? '#059669' : '#64748B' }]}>
                <Icon name="check" size={10} color="#FFFFFF" strokeWidth={3} />
              </View>
              <Text style={styles.statusMessageText}>
                {available
                  ? 'Users can now view and book your rooms'
                  : 'Flipped off — users cannot book your rooms right now'}
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#0A5E44',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  gradientBg: {
    padding: 20,
    paddingTop: 22,
    paddingBottom: 18,
    position: 'relative',
  },
  fullBuildingImage: {
    width: '100%',
    height: '100%',
    opacity: 0.85,
  },
  scriptContainer: {
    position: 'absolute',
    top: 14,
    right: 18,
    alignItems: 'flex-end',
    opacity: 0.95,
    zIndex: 4,
  },
  scriptText: {
    fontSize: 16,
    color: '#E2FBE8',
    fontWeight: '600',
    fontStyle: 'italic',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  leftContent: {
    zIndex: 5,
  },
  greetingLabel: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.94)',
    fontWeight: '600',
  },
  ownerNameText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginTop: 1,
  },
  sunEmoji: {
    fontSize: 24,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    lineHeight: 19,
    fontWeight: '400',
  },
  toggleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    marginTop: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  toggleCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleDotDisc: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  toggleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  toggleTextCol: {
    flex: 1,
    paddingRight: 8,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  toggleSubtext: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  toggleCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 8,
  },
  checkDisc: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusMessageText: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '500',
    flex: 1,
  },
});
