import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PhotoGallery } from '@/components/discovery/PhotoGallery';
import { BottomSheet, Checkbox, Icon, Radio, Text } from '@/components/ui';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { isPortionOption } from '@/services/adapters/food.adapter';
import { useDish } from '@/services/hooks/useFood';
import type { Dish, Kitchen, SpiceLevel } from '@/types/food';
import { SPICE_LABEL } from '@/types/food';
import { formatRupees } from '@/utils/money';

import { AddControl } from './AddControl';
import { FavouriteHeart } from './FavouriteHeart';
import { DietMark, FoodPhoto, RatingPill } from './FoodMarks';
import { FoodNotice } from './FoodNotices';

const SPICES: readonly SpiceLevel[] = ['mild', 'medium', 'hot'];

/**
 * One dish, and the three choices that come with it — shared by the dish
 * page (`app/food/dish/[id].tsx`, reached from the home rails and links) and
 * the sheet a kitchen's menu opens, so the two cannot drift apart.
 *
 * Portion, add-ons and spice, in that order, because that is the order they
 * change the price: portion is the dish, add-ons are additions, spice is free.
 * The CTA carries the running total including everything chosen — a student who
 * ticks ₹15 of curd and then sees "Add to cart" with no number has been given
 * a surprise to discover on the next screen.
 *
 * Allergens flagged in preferences are WARNED about here, never hidden. The
 * data comes from small kitchens and is not good enough to hide food over; a
 * student who is told "you flagged peanut, this has peanut" can decide, and one
 * whose dish silently vanished cannot.
 */
export function useDishChoices(dish: Dish, kitchen: Kitchen, open: boolean) {
  const { add, qtyOf, preferences } = useFood();
  const [addOnIds, setAddOnIds] = useState<readonly string[]>([]);
  const [spice, setSpice] = useState<SpiceLevel>(preferences.spice);
  const [qty, setQty] = useState(1);

  const addOnTotal = (dish.addOns ?? [])
    .filter((addOn) => addOnIds.includes(addOn.id))
    .reduce((sum, addOn) => sum + addOn.price, 0);

  /* One portion at most: choosing one drops any other, and `null` is the
     dish's regular portion. Add-ons are left exactly as they were. */
  const setPortion = (portionId: string | null) =>
    setAddOnIds((current) => [
      ...current.filter((entry) => !isPortionOption(entry)),
      ...(portionId ? [portionId] : []),
    ]);

  return {
    addOnIds,
    setAddOnIds,
    setPortion,
    spice,
    setSpice,
    qty,
    setQty: (next: number) => setQty(Math.max(1, next)),
    unitPrice: dish.price + addOnTotal,
    orderable: open && !dish.soldOut,
    inCart: qtyOf(dish.id),
    flagged: preferences.allergens.filter((allergen) =>
      `${dish.name} ${dish.description}`.toLowerCase().includes(allergen.split(',')[0].toLowerCase()),
    ),
    /* The kitchen travels with the dish so the cart can still name and price
       it when the feed does not list it — see `FoodContext.cartKitchen`. */
    commit: () => add(dish, { qty, addOnIds, spice, kitchen }),
  };
}

type Choices = ReturnType<typeof useDishChoices>;

const PHOTO_HEIGHT = 160;

/**
 * The dish's photos — the kitchen's own, never a stand-in.
 *
 * One photo is drawn as it always was. When the kitchen has added more, they
 * swipe, with a counter, and a tap opens them full screen. A menu row carries
 * only the main photo, so the rest are read from the dish's own response — the
 * same cache entry the dish page uses, so a dish already opened costs nothing.
 */
function DishPhotos({ dish }: { dish: Dish }) {
  const { colors, space, radius } = useTheme();
  const more = useDish(dish.photos ? null : dish.id);
  const photos = dish.photos ?? more.data?.dish.photos ?? [];
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (photos.length < 2) {
    return <FoodPhoto height={PHOTO_HEIGHT} radius={radius.card} uri={dish.photo} label="photo coming from the kitchen" />;
  }

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ height: PHOTO_HEIGHT, borderRadius: radius.card, overflow: 'hidden' }}
    >
      {width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
        >
          {photos.map((uri, index) => (
            <Pressable
              key={uri}
              onPress={() => setOpenAt(index)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${dish.name}, photo ${index + 1} of ${photos.length}. Open full screen.`}
            >
              <FoodPhoto uri={uri} width={width} height={PHOTO_HEIGHT} radius={0} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View
        pointerEvents="none"
        style={[styles.photoCount, { backgroundColor: colors.scrim, borderRadius: radius.pill, paddingHorizontal: space[2] }]}
      >
        <Text variant="numMeta" style={{ color: colors.onGraphite }}>
          {page + 1} / {photos.length}
        </Text>
      </View>
      <PhotoGallery
        visible={openAt !== null}
        onClose={() => setOpenAt(null)}
        groups={[{ id: 'dish', label: dish.name, count: photos.length, uris: photos }]}
        provenance="Photos from the kitchen"
        initialIndex={openAt ?? 0}
      />
    </View>
  );
}

/** Everything above the committing bar. Meant to sit inside a scroll view. */
export function DishDetailContent({ dish, open, choices }: { dish: Dish; open: boolean; choices: Choices }) {
  const { colors, space, radius } = useTheme();
  const { addOnIds, setAddOnIds, setPortion, spice, setSpice, inCart, flagged } = choices;
  /* Portions and add-ons arrive in one list (see `toDish`) but are different
     choices: a portion is pick-one and replaces the price, an add-on is
     pick-any and adds to it. Ticking two portions used to be possible, and the
     cart then charged for both while the server charged for one. */
  const portions = (dish.addOns ?? []).filter((option) => isPortionOption(option.id));
  const addOns = (dish.addOns ?? []).filter((option) => !isPortionOption(option.id));
  const chosenPortion = portions.find((option) => addOnIds.includes(option.id))?.id ?? null;

  return (
    <>
      <DishPhotos dish={dish} />

      <View style={{ gap: space[2] }}>
        <View style={styles.titleRow}>
          <DietMark diet={dish.diet} size={16} />
          <Text variant="display2" style={{ flex: 1 }}>
            {dish.name}
          </Text>
          {/* Bigger here than on a row: this is where somebody arrives having
              decided they are interested, and it is the likeliest place a
              favourite is actually made. */}
          <FavouriteHeart kind="dish" id={dish.id} label={dish.name} size={24} />
        </View>

        <Text variant="body" color="secondary">
          {dish.description}
        </Text>

        <View style={styles.metaRow}>
          {dish.serves ? (
            <Text variant="caption" color="tertiary">
              {dish.serves}
            </Text>
          ) : null}
          {dish.rating ? <RatingPill rating={dish.rating} count={dish.ratingCount} showCount /> : null}
        </View>

        <Text variant="priceHero" style={{ marginTop: space[1] }}>
          {formatRupees(dish.price)}
        </Text>
      </View>

      {/* Availability, before any choice is offered */}
      {dish.soldOut ? (
        <FoodNotice tone="deadline" title="Sold out" body="The kitchen has run out. Check back later." />
      ) : !open ? (
        <FoodNotice
          tone="info"
          title="Kitchen closed right now"
          body="Set your choices now — the cart holds them until the kitchen reopens."
        />
      ) : null}

      {/* Allergens: warned about, never hidden */}
      {flagged.length ? (
        <FoodNotice
          tone="deadline"
          title={`You flagged ${flagged.join(' and ').toLowerCase()}`}
          body="Allergen data comes from the kitchen and is not complete. Ask the kitchen if it matters."
        />
      ) : null}

      {/* Portion — pick one */}
      {portions.length ? (
        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            Portion
          </Text>
          <View
            style={[
              styles.group,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
            ]}
          >
            {[{ id: null, label: 'Regular', price: 0 }, ...portions].map((option, index, all) => (
              <View
                key={option.id ?? 'regular'}
                style={[
                  styles.addOnRow,
                  {
                    paddingVertical: space[2],
                    borderBottomWidth: index === all.length - 1 ? 0 : StyleSheet.hairlineWidth,
                    borderBottomColor: colors.borderSubtle,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Radio
                    label={option.label}
                    selected={chosenPortion === option.id}
                    onSelect={() => setPortion(option.id)}
                  />
                </View>
                {option.price ? (
                  <Text variant="priceSm" color="secondary">
                    {/* A smaller portion costs LESS — said as such, not "+₹-40". */}
                    {option.price > 0 ? '+' : '−'}{formatRupees(Math.abs(option.price))}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Add-ons */}
      {addOns.length ? (
        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            Add-ons
          </Text>
          <View
            style={[
              styles.group,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
            ]}
          >
            {addOns.map((addOn, index) => (
              <View
                key={addOn.id}
                style={[
                  styles.addOnRow,
                  {
                    paddingVertical: space[2],
                    borderBottomWidth: index === addOns.length - 1 ? 0 : StyleSheet.hairlineWidth,
                    borderBottomColor: colors.borderSubtle,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Checkbox
                    label={addOn.label}
                    checked={addOnIds.includes(addOn.id)}
                    onChange={(checked) =>
                      setAddOnIds(checked ? [...addOnIds, addOn.id] : addOnIds.filter((entry) => entry !== addOn.id))
                    }
                  />
                </View>
                <Text variant="priceSm" color="secondary">
                  {formatRupees(addOn.price)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Spice */}
      {!dish.spiceFixed ? (
        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            Spice level
          </Text>
          <View style={[styles.spiceRow, { gap: space[2] }]}>
            {SPICES.map((level) => {
              const active = spice === level;
              return (
                <Pressable
                  key={level}
                  onPress={() => setSpice(level)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.spiceChip,
                    {
                      borderRadius: radius.button,
                      backgroundColor: active ? colors.graphite : colors.surface,
                      borderColor: active ? colors.graphite : colors.border,
                    },
                  ]}
                >
                  <Text variant="title3" style={{ color: active ? colors.onGraphite : colors.textSecondary }}>
                    {SPICE_LABEL[level]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text variant="caption" color="tertiary">
            This goes to the kitchen with the order. Some dishes cannot be changed.
          </Text>
        </View>
      ) : null}

      {/* What other students said */}
      {dish.rating ? (
        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            What students say
          </Text>
          <View
            style={[
              styles.group,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, padding: space[3], gap: space[3] },
            ]}
          >
            <Review
              name="Rahul K."
              stars={5}
              when="2 days ago"
              body="Sambar is properly spicy and the refill actually happens. Cheaper than my mess."
            />
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />
            <Review
              name="Sneha M."
              stars={4}
              when="last week"
              body="Portion is right for one. Ask for less rice if you are picking up."
            />
          </View>
        </View>
      ) : null}

      {inCart > 0 ? (
        <Text variant="caption" color="tertiary">
          {inCart} already in your cart. Adding here does not replace it.
        </Text>
      ) : null}
    </>
  );
}

/** The quantity stepper and the button that carries the number, always. */
export function DishCommitBar({
  dish,
  choices,
  onCommitted,
}: {
  dish: Dish;
  choices: Choices;
  onCommitted: () => void;
}) {
  const { colors, space, radius } = useTheme();
  const { qty, setQty, orderable, unitPrice, commit } = choices;

  return (
    <View style={[styles.cta, { gap: space[3] }]}>
      <AddControl
        value={qty}
        onChange={setQty}
        size="lg"
        disabled={!orderable}
        reason={dish.soldOut ? 'Sold out' : 'Kitchen closed'}
        accessibilityLabel={dish.name}
      />

      <Pressable
        onPress={
          orderable
            ? () => {
                /* Only on a real add. A dish from another kitchen comes back
                   'conflict' and waits on the switch prompt — leaving the
                   screen then dropped it silently. */
                if (commit() === 'added') onCommitted();
              }
            : undefined
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: !orderable }}
        accessibilityLabel={`Add to cart, ${formatRupees(unitPrice * qty)}`}
        style={({ pressed }) => [
          styles.ctaButton,
          {
            borderRadius: radius.button,
            backgroundColor: orderable ? (pressed ? colors.graphiteRaised : colors.graphite) : colors.surfaceSunken,
          },
        ]}
      >
        <Text variant="title2" style={{ color: orderable ? colors.onGraphite : colors.textTertiary }}>
          {orderable ? `Add to cart · ${formatRupees(unitPrice * qty)}` : 'Not cooking right now'}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * The dish as a bottom sheet over a kitchen's menu, so choosing one does not
 * take the student off the menu they are reading.
 *
 * Mount it with `key={dish.id}` so a different dish starts from fresh choices.
 */
export function DishSheet({
  dish,
  kitchen,
  open,
  visible,
  onClose,
}: {
  dish: Dish;
  kitchen: Kitchen;
  open: boolean;
  visible: boolean;
  onClose: () => void;
}) {
  const { space } = useTheme();
  const choices = useDishChoices(dish, kitchen, open);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={kitchen.name}
      footer={<DishCommitBar dish={dish} choices={choices} onCommitted={onClose} />}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space[4], gap: space[4] }}
      >
        <DishDetailContent dish={dish} open={open} choices={choices} />
      </ScrollView>
    </BottomSheet>
  );
}

function Review({ name, stars, when, body }: { name: string; stars: number; when: string; body: string }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ gap: space[1] }}>
      <View style={styles.reviewHead}>
        <Text variant="title3">{name}</Text>
        <View style={styles.stars}>
          {Array.from({ length: stars }).map((_, index) => (
            <Icon key={index} name="star" size={16} color={colors.deal.ink} fill={colors.deal.base} />
          ))}
        </View>
        <Text variant="numMeta" color="tertiary">
          {when}
        </Text>
      </View>
      <Text variant="caption" color="secondary">
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photoCount: { position: 'absolute', right: 10, bottom: 10, paddingVertical: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  group: { borderWidth: StyleSheet.hairlineWidth },
  addOnRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spiceRow: { flexDirection: 'row' },
  spiceChip: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  cta: { flexDirection: 'row', alignItems: 'center' },
  ctaButton: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stars: { flexDirection: 'row', gap: 1 },
});
