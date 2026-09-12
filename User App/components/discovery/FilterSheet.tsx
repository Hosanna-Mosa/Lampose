import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useBottomEdgeInset } from '@/hooks/useActionBarInset';
import { Button, CeilingSlider, Icon, Text, type IconName } from '@/components/ui';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { CATEGORY_LABEL } from './CategoryTabs';
import { AMENITY_ICON, AMENITY_LABEL } from './AmenityIcon';
import type { StayCategory } from '@/constants/tokens';
import { genderMeta, type AmenityName, type Gender, type Listing } from '@/types/listing';
import {
  activeFilterCount,
  applyQuery,
  facetsFor,
  filterSpecFor,
  hasBlockingIssue,
  validateQuery,
  type FilterIssue,
  type SearchQuery,
} from '@/types/filters';

const COUNT_DEBOUNCE = 280;

const AMENITY_CHOICES: readonly AmenityName[] = [
  'powerBackup',
  'waterSupply',
  'wifi',
  'mess',
  'attachedBath',
  'laundry',
  'ac',
  'parking',
];

const GENDER_CHOICES: readonly Gender[] = ['BOYS', 'GIRLS'];

const clearedFilters: Partial<SearchQuery> = {
  categories: [],
  rentCeiling: null,
  sharing: [],
  furnishing: [],
  meals: null,
  amenities: [],
};

export type FilterSheetProps = {
  query: SearchQuery;
  inventory: readonly Listing[];
  category: StayCategory | null;
  onApply: (query: SearchQuery) => void;
  onClose: () => void;
};

type SectionId = 'gender' | 'rent' | 'sharing' | 'meals' | 'furnishing' | 'amenities';

export function FilterSheet({ query, inventory, category, onApply, onClose }: FilterSheetProps) {
  const { colors, space, radius, layout, mode } = useTheme();
  const bottomInset = useBottomEdgeInset();
  const reduceMotion = useReduceMotion();
  const isDark = mode === 'dark';

  const scrollViewRef = useRef<ScrollView>(null);
  const sectionPositions = useRef<Partial<Record<SectionId, number>>>({});

  const [draft, setDraft] = useState<SearchQuery>(query);
  const [count, setCount] = useState(() => applyQuery(inventory, query).length);
  const [counting, setCounting] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('gender');

  const spec = filterSpecFor(category);
  const facets = useMemo(() => facetsFor(inventory), [inventory]);

  const issues = useMemo(
    () => validateQuery(draft, inventory, category),
    [draft, inventory, category],
  );
  const blocked = hasBlockingIssue(issues);
  const totalActive = activeFilterCount(draft);

  // Debounced real-time count
  useEffect(() => {
    setCounting(true);
    const timer = setTimeout(() => {
      setCount(applyQuery(inventory, draft).length);
      setCounting(false);
    }, COUNT_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [draft, inventory]);

  // Scaled rent ladder
  const { rentMax, rentStep, rentPresets } = useMemo(() => {
    const rents = inventory.map((l) => l.rent).filter((r): r is number => r !== null && r > 0);
    const dearest = rents.length ? Math.max(...rents) : 0;
    const step = dearest > 20000 ? 1000 : dearest > 5000 ? 500 : 100;
    const max = Math.max(step * 10, Math.ceil((dearest * 1.1) / step) * step);
    const presets = [0.25, 0.5, 0.75, 1]
      .map((fraction) => Math.round((max * fraction) / step) * step)
      .filter((value, index, all) => value > 0 && all.indexOf(value) === index);
    return { rentMax: max, rentStep: step, rentPresets: presets };
  }, [inventory]);

  const patch = (next: Partial<SearchQuery>) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setDraft((current) => ({ ...current, ...next }));
  };

  const toggle = <T,>(list: readonly T[], value: T): readonly T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const issueFor = (field: FilterIssue['field']) => issues.find((issue) => issue.field === field);

  const recordLayout = (id: SectionId, e: LayoutChangeEvent) => {
    sectionPositions.current[id] = e.nativeEvent.layout.y;
  };

  const scrollToSection = (id: SectionId) => {
    setActiveSection(id);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    const y = sectionPositions.current[id];
    if (y !== undefined) {
      scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
    }
  };

  const handleClearAll = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setDraft({ ...draft, ...clearedFilters });
  };

  // Quick navigation items
  const jumpItems: { id: SectionId; label: string; icon: IconName }[] = useMemo(() => {
    const items: { id: SectionId; label: string; icon: IconName }[] = [];
    if (spec.gender) items.push({ id: 'gender', label: 'Gender', icon: 'visitors' });
    items.push({ id: 'rent', label: 'Budget', icon: 'rupee' });
    if (spec.sharingLabel && facets.sharing.length > 1) {
      items.push({ id: 'sharing', label: 'Sharing', icon: 'bed' });
    }
    if (spec.meals && facets.hasMeals) {
      items.push({ id: 'meals', label: 'Meals', icon: 'mess' });
    }
    if (spec.furnishing && facets.furnishing.length > 1) {
      items.push({ id: 'furnishing', label: 'Furnishing', icon: 'houseIcon' });
    }
    items.push({ id: 'amenities', label: 'Amenities', icon: 'star' });
    return items;
  }, [spec, facets]);

  const currentRentDisplay = draft.rentCeiling ? draft.rentCeiling : rentMax;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Top Modal Drag Indicator Bar */}
      <View style={styles.topGrabContainer}>
        <View style={[styles.grabHandle, { backgroundColor: colors.borderSubtle }]} />
      </View>

      {/* Header Bar */}
      <View
        style={[
          styles.headerBar,
          {
            borderBottomColor: colors.borderSubtle,
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          },
        ]}
      >
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close filters"
          style={({ pressed }) => [
            styles.circularCloseBtn,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Icon name="close" size={18} color={colors.textPrimary} />
        </Pressable>

        <View style={styles.headerCenter}>
          <View style={styles.titleRow}>
            <Text variant="title2" style={{ color: colors.textPrimary, fontWeight: '700' }}>
              Filters
            </Text>
            {totalActive > 0 ? (
              <View style={[styles.countPill, { backgroundColor: colors.brand }]}>
                <Text variant="caption" style={{ color: '#FFFFFF', fontWeight: '700' }}>
                  {totalActive}
                </Text>
              </View>
            ) : null}
          </View>
          {category ? (
            <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
              {CATEGORY_LABEL[category]}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={handleClearAll}
          disabled={totalActive === 0}
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          style={({ pressed }) => [
            styles.resetBtn,
            { opacity: totalActive === 0 ? 0.35 : pressed ? 0.7 : 1 },
          ]}
        >
          <Text
            variant="bodyStrong"
            style={{
              color: totalActive > 0 ? colors.brand : colors.textTertiary,
              fontWeight: '600',
            }}
          >
            Clear all
          </Text>
        </Pressable>
      </View>

      {/* Sticky Horizontal Quick Jump Rail */}
      <View style={[styles.jumpRailWrapper, { borderBottomColor: colors.borderSubtle }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.jumpRailContent, { paddingHorizontal: layout.gutter }]}
        >
          {jumpItems.map((item) => {
            const isSelected = activeSection === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => scrollToSection(item.id)}
                style={({ pressed }) => [
                  styles.jumpChip,
                  {
                    backgroundColor: isSelected
                      ? colors.brand
                      : isDark
                        ? 'rgba(255, 255, 255, 0.06)'
                        : 'rgba(0, 0, 0, 0.04)',
                    borderColor: isSelected ? colors.brand : colors.borderSubtle,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Icon
                  name={item.icon}
                  size={14}
                  color={isSelected ? '#FFFFFF' : colors.textSecondary}
                />
                <Text
                  variant="caption"
                  style={{
                    color: isSelected ? '#FFFFFF' : colors.textPrimary,
                    fontWeight: isSelected ? '700' : '500',
                    marginLeft: 6,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Filter Content */}
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: space[4],
          paddingBottom: space[8] + 80, // Space for sticky bottom bar
          gap: space[6],
        }}
      >
        {/* SECTION 1: GENDER */}
        {spec.gender ? (
          <View onLayout={(e) => recordLayout('gender', e)} style={styles.sectionContainer}>
            <SectionHeader
              title="Who is this for?"
              badge="Required"
              badgeColor="danger"
              subtitle="PGs and hostels enforce gender-specific admissions."
            />

            <View style={[styles.personaGrid, { gap: space[3] }]}>
              {GENDER_CHOICES.map((gender) => {
                const isSelected = draft.gender === gender;
                const isBoys = gender === 'BOYS';
                const accentTint = isBoys
                  ? isDark
                    ? '#0C4A6E'
                    : '#F0F9FF'
                  : isDark
                    ? '#701A75'
                    : '#FDF2F8';
                const borderHighlight = isBoys ? '#0284C7' : '#D946EF';

                return (
                  <Pressable
                    key={gender}
                    onPress={() => patch({ gender })}
                    style={({ pressed }) => [
                      styles.personaCard,
                      {
                        backgroundColor: isSelected
                          ? accentTint
                          : isDark
                            ? 'rgba(255, 255, 255, 0.04)'
                            : colors.surface,
                        borderColor: isSelected ? borderHighlight : colors.borderSubtle,
                        borderWidth: isSelected ? 2 : 1,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View style={styles.personaTopRow}>
                      <View
                        style={[
                          styles.personaIconWrap,
                          {
                            backgroundColor: isSelected
                              ? borderHighlight
                              : isDark
                                ? 'rgba(255, 255, 255, 0.08)'
                                : 'rgba(0, 0, 0, 0.05)',
                          },
                        ]}
                      >
                        <Icon
                          name="visitors"
                          size={18}
                          color={isSelected ? '#FFFFFF' : colors.textSecondary}
                        />
                      </View>
                      {isSelected ? (
                        <View
                          style={[styles.checkIndicator, { backgroundColor: borderHighlight }]}
                        >
                          <Icon name="check" size={12} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </View>

                    <Text
                      variant="title3"
                      style={{
                        color: colors.textPrimary,
                        fontWeight: '700',
                        marginTop: 10,
                      }}
                    >
                      {genderMeta[gender].label}
                    </Text>
                    <Text
                      variant="caption"
                      color="secondary"
                      style={{ marginTop: 4, lineHeight: 17 }}
                    >
                      {isBoys
                        ? 'Hostels & rooms open to boys / male residents'
                        : 'Hostels & rooms open to girls / female residents'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <IssueLine issue={issueFor('gender')} onFix={patch} />
          </View>
        ) : null}

        {/* SECTION 2: BUDGET & PRICE SLIDER */}
        <View onLayout={(e) => recordLayout('rent', e)} style={styles.sectionContainer}>
          <SectionHeader
            title={spec.rentLabel}
            subtitle="Fine-tune your maximum monthly rent ceiling."
          />

          {/* Hero Live Price Card */}
          <View
            style={[
              styles.heroPriceCard,
              {
                backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#F8FAFC',
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.heroPriceLeft}>
              <Text variant="caption" color="secondary">
                MAXIMUM MONTHLY BUDGET
              </Text>
              <Text
                variant="title1"
                style={{
                  color: colors.brand,
                  fontWeight: '800',
                  marginTop: 2,
                }}
              >
                ₹{currentRentDisplay.toLocaleString('en-IN')}
                <Text variant="caption" color="secondary" style={{ fontWeight: '500' }}>
                  {' '}/ month
                </Text>
              </Text>
            </View>

            {draft.rentCeiling !== null ? (
              <Pressable
                onPress={() => patch({ rentCeiling: null })}
                style={({ pressed }) => [
                  styles.clearCeilingBtn,
                  { backgroundColor: colors.borderSubtle, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text variant="caption" style={{ color: colors.textSecondary, fontWeight: '600' }}>
                  Reset ceiling
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Preset Buttons */}
          <View style={[styles.presetRow, { gap: space[2] }]}>
            {rentPresets.map((preset) => {
              const isSelected = draft.rentCeiling === preset;
              return (
                <Pressable
                  key={preset}
                  onPress={() => patch({ rentCeiling: preset })}
                  style={({ pressed }) => [
                    styles.presetPill,
                    {
                      backgroundColor: isSelected
                        ? colors.brand
                        : isDark
                          ? 'rgba(255, 255, 255, 0.05)'
                          : colors.surface,
                      borderColor: isSelected ? colors.brand : colors.borderSubtle,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text
                    variant="caption"
                    style={{
                      color: isSelected ? '#FFFFFF' : colors.textPrimary,
                      fontWeight: isSelected ? '700' : '500',
                    }}
                  >
                    Up to ₹{(preset / 1000).toFixed(0)}k
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Slider */}
          <View style={{ marginTop: space[3] }}>
            <CeilingSlider
              label="Rent Track"
              value={draft.rentCeiling ?? rentMax}
              onChange={(value) => patch({ rentCeiling: value })}
              min={0}
              max={rentMax}
              step={rentStep}
              presets={rentPresets}
              accent={colors.brand}
            />
          </View>
          <IssueLine issue={issueFor('rent')} onFix={patch} />
        </View>

        {/* SECTION 3: SHARING & ROOM TYPE (2-Column Grid) */}
        {spec.sharingLabel && facets.sharing.length > 1 ? (
          <View onLayout={(e) => recordLayout('sharing', e)} style={styles.sectionContainer}>
            <SectionHeader
              title={spec.sharingLabel}
              subtitle="Choose the room occupancy that suits your lifestyle."
            />
            <View style={[styles.twoColGrid, { gap: space[3] }]}>
              {facets.sharing.map((sharing) => {
                const isSelected = draft.sharing.includes(sharing);
                return (
                  <Pressable
                    key={sharing}
                    onPress={() => patch({ sharing: toggle(draft.sharing, sharing) })}
                    style={({ pressed }) => [
                      styles.sharingCard,
                      {
                        backgroundColor: isSelected
                          ? isDark
                            ? 'rgba(15, 118, 110, 0.25)'
                            : '#F0FDF4'
                          : isDark
                            ? 'rgba(255, 255, 255, 0.04)'
                            : colors.surface,
                        borderColor: isSelected ? colors.brand : colors.borderSubtle,
                        borderWidth: isSelected ? 2 : 1,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <View style={styles.sharingCardTop}>
                      <Icon
                        name="bed"
                        size={18}
                        color={isSelected ? colors.brand : colors.textSecondary}
                      />
                      {isSelected ? (
                        <View
                          style={[styles.miniCheckDot, { backgroundColor: colors.brand }]}
                        >
                          <Icon name="check" size={12} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </View>
                    <Text
                      variant="bodyStrong"
                      style={{
                        color: colors.textPrimary,
                        fontWeight: '700',
                        marginTop: 8,
                      }}
                    >
                      {sharing}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* SECTION 4: MEALS & DINING PREFERENCE */}
        {spec.meals && facets.hasMeals ? (
          <View onLayout={(e) => recordLayout('meals', e)} style={styles.sectionContainer}>
            <SectionHeader
              title="Dining & Meals"
              subtitle="Filter based on daily mess food and meal coverage."
            />
            <View style={[styles.mealOptionsWrap, { gap: space[2] }]}>
              {/* Option 1: Food included */}
              <MealCard
                title="Food Included"
                description="Daily breakfast, lunch & dinner / mess provided"
                icon="mess"
                selected={draft.meals === true}
                onPress={() => patch({ meals: draft.meals === true ? null : true })}
              />

              {/* Option 2: Without food */}
              <MealCard
                title="Without Food / Self Cooking"
                description="Pay for stay only, cook or eat outside"
                icon="flame"
                selected={draft.meals === false}
                onPress={() => patch({ meals: draft.meals === false ? null : false })}
              />

              {/* Option 3: Any */}
              <MealCard
                title="Any / Doesn't Matter"
                description="Show places both with and without food"
                icon="check"
                selected={draft.meals === null}
                onPress={() => patch({ meals: null })}
              />
            </View>
          </View>
        ) : null}

        {/* SECTION 5: FURNISHING */}
        {spec.furnishing && facets.furnishing.length > 1 ? (
          <View onLayout={(e) => recordLayout('furnishing', e)} style={styles.sectionContainer}>
            <SectionHeader
              title="Furnishing Status"
              subtitle="From move-in ready setups to unfurnished spaces."
            />
            <View style={[styles.twoColGrid, { gap: space[3] }]}>
              {facets.furnishing.map((furnishing) => {
                const isSelected = draft.furnishing.includes(furnishing);
                return (
                  <Pressable
                    key={furnishing}
                    onPress={() => patch({ furnishing: toggle(draft.furnishing, furnishing) })}
                    style={({ pressed }) => [
                      styles.furnishingCard,
                      {
                        backgroundColor: isSelected
                          ? isDark
                            ? 'rgba(15, 118, 110, 0.25)'
                            : '#F0FDF4'
                          : isDark
                            ? 'rgba(255, 255, 255, 0.04)'
                            : colors.surface,
                        borderColor: isSelected ? colors.brand : colors.borderSubtle,
                        borderWidth: isSelected ? 2 : 1,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <View style={styles.furnishingTop}>
                      <Icon
                        name="houseIcon"
                        size={18}
                        color={isSelected ? colors.brand : colors.textSecondary}
                      />
                      {isSelected ? (
                        <View
                          style={[styles.miniCheckDot, { backgroundColor: colors.brand }]}
                        >
                          <Icon name="check" size={12} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </View>
                    <Text
                      variant="bodyStrong"
                      style={{
                        color: colors.textPrimary,
                        fontWeight: '700',
                        marginTop: 8,
                      }}
                    >
                      {furnishing}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* SECTION 6: AMENITIES */}
        <View onLayout={(e) => recordLayout('amenities', e)} style={styles.sectionContainer}>
          <SectionHeader
            title="Must-Have Amenities"
            subtitle="Select the non-negotiables for your stay."
          />
          <View style={[styles.amenitiesGrid, { gap: space[2] }]}>
            {AMENITY_CHOICES.map((amenity) => {
              const isSelected = draft.amenities.includes(amenity);
              const iconName = AMENITY_ICON[amenity] || 'star';

              return (
                <Pressable
                  key={amenity}
                  onPress={() => patch({ amenities: toggle(draft.amenities, amenity) })}
                  style={({ pressed }) => [
                    styles.amenityCard,
                    {
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(15, 118, 110, 0.3)'
                          : '#ECFDF5'
                        : isDark
                          ? 'rgba(255, 255, 255, 0.04)'
                          : colors.surface,
                      borderColor: isSelected ? colors.brand : colors.borderSubtle,
                      borderWidth: isSelected ? 2 : 1,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.amenityIconBubble,
                      {
                        backgroundColor: isSelected
                          ? colors.brand
                          : isDark
                            ? 'rgba(255, 255, 255, 0.08)'
                            : '#F1F5F9',
                      },
                    ]}
                  >
                    <Icon
                      name={iconName}
                      size={16}
                      color={isSelected ? '#FFFFFF' : colors.textPrimary}
                    />
                  </View>
                  <Text
                    variant="caption"
                    style={{
                      color: colors.textPrimary,
                      fontWeight: isSelected ? '700' : '500',
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {AMENITY_LABEL[amenity]}
                  </Text>
                  {isSelected ? (
                    <Icon name="check" size={14} color={colors.brand} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <IssueLine issue={issueFor('combination')} onFix={patch} />
      </ScrollView>

      {/* FLOATING SMART ACTION DOCK */}
      <View
        style={[
          styles.smartFooter,
          {
            backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
            borderTopColor: colors.borderSubtle,
            paddingHorizontal: layout.gutter,
            paddingTop: space[3],
            paddingBottom: bottomInset + layout.gutter,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: isDark ? 0.3 : 0.08,
            shadowRadius: 8,
            elevation: 10,
          },
        ]}
      >
        {count === 0 && !blocked ? (
          <View style={[styles.advisoryAlert, { backgroundColor: isDark ? '#33200B' : '#FEF3C7' }]}>
            <Icon name="alert" size={14} color={isDark ? '#FCD34D' : '#D97706'} />
            <Text
              variant="caption"
              style={{
                color: isDark ? '#FCD34D' : '#92400E',
                flex: 1,
                marginLeft: 6,
              }}
            >
              No listings match this specific mix.
            </Text>
            <Pressable
              onPress={() => patch({ rentCeiling: null, amenities: [] })}
              style={styles.loosenBtn}
            >
              <Text variant="caption" style={{ color: colors.brand, fontWeight: '700' }}>
                Loosen
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.footerActionRow}>
          {totalActive > 0 ? (
            <Pressable
              onPress={handleClearAll}
              style={({ pressed }) => [styles.footerClearBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text variant="bodyStrong" style={{ color: colors.textSecondary }}>
                Reset
              </Text>
            </Pressable>
          ) : null}

          <View style={{ flex: 1 }}>
            <Button
              label={
                blocked
                  ? 'Pick who this is for'
                  : count === 0
                    ? 'No places match'
                    : `Show ${count} ${count === 1 ? 'place' : 'places'}`
              }
              disabled={blocked || count === 0}
              onPress={() => onApply(draft)}
              fullWidth
              style={counting ? { opacity: 0.6 } : undefined}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function SectionHeader({
  title,
  subtitle,
  badge,
  badgeColor = 'brand',
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: 'brand' | 'danger';
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleLine}>
        <Text variant="title3" style={{ color: colors.textPrimary, fontWeight: '700' }}>
          {title}
        </Text>
        {badge ? (
          <View
            style={[
              styles.requiredBadge,
              { backgroundColor: badgeColor === 'danger' ? '#EF4444' : colors.brand },
            ]}
          >
            <Text variant="caption" style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 11 }}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      {subtitle ? (
        <Text variant="caption" color="secondary" style={{ marginTop: 2, lineHeight: 16 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function MealCard({
  title,
  description,
  icon,
  selected,
  onPress,
}: {
  title: string;
  description: string;
  icon: IconName;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, mode } = useTheme();
  const isDark = mode === 'dark';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.mealCard,
        {
          backgroundColor: selected
            ? isDark
              ? 'rgba(15, 118, 110, 0.25)'
              : '#F0FDF4'
            : isDark
              ? 'rgba(255, 255, 255, 0.04)'
              : colors.surface,
          borderColor: selected ? colors.brand : colors.borderSubtle,
          borderWidth: selected ? 2 : 1,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.mealIconBubble,
          {
            backgroundColor: selected
              ? colors.brand
              : isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : '#F1F5F9',
          },
        ]}
      >
        <Icon name={icon} size={18} color={selected ? '#FFFFFF' : colors.textPrimary} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text variant="bodyStrong" style={{ color: colors.textPrimary, fontWeight: '700' }}>
          {title}
        </Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
          {description}
        </Text>
      </View>
      {selected ? (
        <View style={[styles.miniCheckDot, { backgroundColor: colors.brand, marginLeft: 8 }]}>
          <Icon name="check" size={12} color="#FFFFFF" />
        </View>
      ) : null}
    </Pressable>
  );
}

function IssueLine({
  issue,
  onFix,
}: {
  issue?: FilterIssue;
  onFix: (patch: Partial<SearchQuery>) => void;
}) {
  const { colors, space, radius } = useTheme();
  const reduceMotion = useReduceMotion();

  if (!issue) return null;

  const blocking = issue.level === 'blocking';
  const set = blocking ? colors.danger : colors.warning;

  return (
    <Animated.View
      entering={FadeIn.duration(reduceMotion ? 120 : 200)}
      accessibilityRole="alert"
      style={[
        styles.issue,
        {
          backgroundColor: set.tint,
          borderColor: set.border,
          borderRadius: radius.chip,
          padding: space[3],
          gap: space[2],
          marginTop: space[3],
        },
      ]}
    >
      <Icon name={blocking ? 'alert' : 'clock'} size={16} color={set.ink} />
      <View style={styles.flex}>
        <Text variant="caption" style={{ color: set.ink }}>
          {issue.message}
        </Text>
        {issue.fix ? (
          <Pressable
            onPress={() => onFix(issue.fix!.patch)}
            accessibilityRole="button"
            accessibilityLabel={issue.fix.label}
            style={{ minHeight: 40, justifyContent: 'center' }}
          >
            <Text variant="bodyStrong" style={{ color: set.ink, textDecorationLine: 'underline' }}>
              {issue.fix.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topGrabContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  grabHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  circularCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  resetBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  jumpRailWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  jumpRailContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jumpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  sectionContainer: {
    // Container for each modular block
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requiredBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  personaGrid: {
    flexDirection: 'row',
  },
  personaCard: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
  },
  personaTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  personaIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPriceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  heroPriceLeft: {
    flex: 1,
  },
  clearCeilingBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  presetPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  twoColGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sharingCard: {
    width: '48%',
    padding: 14,
    borderRadius: 14,
  },
  sharingCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  miniCheckDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealOptionsWrap: {},
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
  },
  mealIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  furnishingCard: {
    width: '48%',
    padding: 14,
    borderRadius: 14,
  },
  furnishingTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  amenityCard: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
  },
  amenityIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  smartFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footerClearBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  advisoryAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 10,
  },
  loosenBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  flex: { flex: 1 },
  issue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
