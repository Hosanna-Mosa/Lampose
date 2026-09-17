import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { openInGoogleMaps, type Place } from '@/utils/maps';

/**
 * The hand-off to Google Maps.
 *
 * This replaces the in-app map view entirely. The button says where it is
 * going — "Open in Google Maps", not "Directions" — because a control that
 * leaves the app should say so before it does it, not after. Nothing about a
 * booking is lost by leaving; the student comes back to the same screen.
 *
 * The address is shown above the button rather than hidden behind it. Someone
 * standing at a gate with no signal needs to be able to read it out to an auto
 * driver, and that has to work whether or not a maps app opens.
 */

export type DirectionsButtonProps = {
  place: Place;
  /** Shown above the button so it is readable without leaving. */
  address?: string;
  /** A landmark line — how people here actually navigate the last 200 metres. */
  landmark?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  label?: string;
};

export function DirectionsButton({
  place,
  address,
  landmark,
  variant = 'secondary',
  label = 'Open in Google Maps',
}: DirectionsButtonProps) {
  const { colors, space, radius } = useTheme();
  const [failed, setFailed] = useState(false);

  const open = async () => {
    const ok = await openInGoogleMaps(place, 'directions');
    // Say so, rather than appearing to do nothing.
    setFailed(!ok);
  };

  return (
    <View style={{ gap: 10 }}>
      {address || landmark ? (
        <View
          style={{
            backgroundColor: '#F8FAFC',
            borderRadius: 14,
            padding: 14,
            gap: 4,
            borderWidth: 1,
            borderColor: '#E2E8F0',
          }}
        >
          {address ? (
            <Text variant="bodyStrong" selectable style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>
              {address}
            </Text>
          ) : null}
          {landmark ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <Icon name="mapPin" size={12} color="#64748B" />
              <Text variant="caption" color="secondary">
                {landmark}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* The pin breathes. This is the one control on the screen that leaves
          the app, and on a booking page of otherwise static cards the movement
          is what finds it. An infinite loop, and a counted one — see
          `ambient.mapsPinPulse` in `motion.ts` before repeating it elsewhere. */}
      <Button label={label} variant={variant} onPress={open} fullWidth icon="mapPin" iconPulse />

      {failed ? (
        <View style={[styles.row, { gap: space[2] }]}>
          <Icon name="alert" size={16} color={colors.warning.ink} />
          <Text variant="caption" style={{ color: colors.warning.ink, flex: 1 }}>
            Couldn&apos;t open Maps on this phone. The address above is selectable — copy it and paste it
            into any maps app.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
});
