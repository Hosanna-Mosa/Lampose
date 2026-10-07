import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PhotoGallery } from '@/components/discovery/PhotoGallery';
import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

import { FoodPhoto } from './FoodMarks';

/**
 * A row of a restaurant's (or a dish's) own photographs, and the full-screen
 * gallery a tap opens on the photo tapped.
 *
 * Only ever real uploads: the URLs come from the kitchen's own
 * `galleryImages`, through the adapter's https-only rule. With none there is
 * no strip at all — never stand-in pictures to fill the space.
 *
 * The gallery is the stays side's, so a photo opens the same way everywhere in
 * the app: dark ground, `contain` (a cropped photo of a dining room is the
 * wrong trade when somebody is choosing a table), and a counter.
 */
export type FoodPhotoStripProps = {
  /** "Photos" — the heading above the row. */
  title: string;
  uris: readonly string[];
  /** Under the photos in the gallery: who took them. */
  provenance?: string;
  /** Inset of the first and last tile from the screen edge. */
  gutter: number;
  muted?: boolean;
};

const TILE_W = 132;
const TILE_H = 100;

export function FoodPhotoStrip({ title, uris, provenance, gutter, muted }: FoodPhotoStripProps) {
  const { space, radius } = useTheme();
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (!uris.length) return null;

  return (
    <View style={{ gap: space[2] }}>
      <View style={[styles.head, { paddingHorizontal: gutter }]}>
        <Text variant="title3">{title}</Text>
        <Text variant="numMeta" color="tertiary">
          {uris.length}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: gutter, gap: space[2] }}
      >
        {uris.map((uri, index) => (
          <Pressable
            key={uri}
            onPress={() => setOpenAt(index)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${title}, photo ${index + 1} of ${uris.length}. Open full screen.`}
          >
            <FoodPhoto uri={uri} width={TILE_W} height={TILE_H} radius={radius.card} muted={muted} />
          </Pressable>
        ))}
      </ScrollView>

      <PhotoGallery
        visible={openAt !== null}
        onClose={() => setOpenAt(null)}
        groups={[{ id: 'photos', label: title, count: uris.length, uris }]}
        provenance={provenance}
        initialIndex={openAt ?? 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
});
