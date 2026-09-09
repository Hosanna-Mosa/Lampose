import React from 'react';
import { Pressable, ScrollView, StyleSheet, View, type TextStyle } from 'react-native';

import { BottomSheet, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { Dish } from '@/types/food';

import { FoodPhoto } from './FoodMarks';

const TILE_PHOTO = 64;

export type CuisineSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Every cuisine in the feed, not just the ones the rail had room for. */
  cuisines: readonly { name: string; photo?: string | number }[];
  /** The popular dishes, already deduplicated and ordered by the caller. */
  dishes: readonly Dish[];
  onPickCuisine: (name: string) => void;
  onPickDish: (id: string) => void;
};

/**
 * The whole browsing vocabulary, in one grid.
 *
 * The rail across the top of Food Home shows about ten cuisines because that
 * is what fits; this is where the rest of them live, together with the
 * dishes people actually order. Two different kinds of thing in one grid is
 * deliberate and is what the sheet's title says: a student looking for food
 * does not sort their craving into "cuisine" and "dish" before they start
 * looking, they think "biryani" or "Chinese" without caring which is which.
 *
 * What they DO is different, though, and the two halves are labelled so the
 * difference is visible before the tap: a cuisine narrows the feed behind
 * this sheet, a dish opens that dish.
 *
 * Every photograph is a real dish from the catalogue — see `FoodHome`, which
 * builds both lists. Nothing here is bundled artwork, so the grid grows and
 * changes with the menu instead of drifting away from it.
 */
export function CuisineSheet({
  visible,
  onClose,
  cuisines,
  dishes,
  onPickCuisine,
  onPickDish,
}: CuisineSheetProps) {
  const { space, layout } = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Cuisines and dishes">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space[6] }}
      >
        {cuisines.length ? (
          <>
            <SectionLabel>Cuisines</SectionLabel>
            <View style={styles.grid}>
              {cuisines.map((cuisine) => (
                <Tile
                  key={`c-${cuisine.name}`}
                  label={cuisine.name}
                  photo={cuisine.photo}
                  onPress={() => onPickCuisine(cuisine.name)}
                />
              ))}
            </View>
          </>
        ) : null}

        {dishes.length ? (
          <>
            <SectionLabel style={{ marginTop: space[4] }}>Popular dishes</SectionLabel>
            <View style={styles.grid}>
              {dishes.map((dish) => (
                <Tile
                  key={`d-${dish.id}`}
                  label={dish.name}
                  photo={dish.photo}
                  onPress={() => onPickDish(dish.id)}
                />
              ))}
            </View>
          </>
        ) : null}

        {!cuisines.length && !dishes.length ? (
          <Text variant="body" color="tertiary" style={{ paddingHorizontal: layout.gutter }}>
            Nothing to browse yet — no kitchen near you has listed a menu.
          </Text>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const { space, layout } = useTheme();
  return (
    <Text
      variant="eyebrow"
      color="tertiary"
      style={{ paddingHorizontal: layout.gutter, marginBottom: space[2], ...style }}
    >
      {children}
    </Text>
  );
}

function Tile({
  label,
  photo,
  onPress,
}: {
  label: string;
  /** A URL for a dish tile, a bundled asset for a cuisine tile — see
   *  `FoodPhotoProps.uri`. */
  photo?: string | number;
  onPress: () => void;
}) {
  const { space } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, { paddingVertical: space[2], opacity: pressed ? 0.6 : 1 }]}
    >
      <FoodPhoto height={TILE_PHOTO} width={TILE_PHOTO} radius={TILE_PHOTO / 2} uri={photo} />
      <Text variant="caption" numberOfLines={1} style={{ marginTop: 6, textAlign: 'center' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  /* Four to a row, sized by fraction rather than by a fixed width, so the
     grid keeps its columns on a 320pt phone and a tablet alike. */
  tile: { width: '25%', alignItems: 'center', paddingHorizontal: 4 },
});
