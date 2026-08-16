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
    <View style={{ gap: space[2] }}>
      {address || landmark ? (
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.chip,
            padding: space[3],
            gap: space[1],
          }}
        >
          {address ? (
            <Text variant="body" selectable>
              {address}
            </Text>
          ) : null}
          {landmark ? (
            <Text variant="caption" color="secondary">
              {landmark}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Button label={label} variant={variant} onPress={open} fullWidth icon="mapPin" />

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
