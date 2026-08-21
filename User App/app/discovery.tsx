import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RentDisplay, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  AmenityGrid,
  CategoryTabs,
  CATEGORY_BLURB,
  DepositBadge,
  FilterChipRow,
  GenderBadge,
  DirectionsButton,
  HouseRulesRow,
  ListingCard,
  ListingCardSkeleton,
  MealPlanCard,
  MoveInBreakdown,
  SharingTypeSelector,
  defaultSharingSelection,
  type FilterChip,
} from '@/components/discovery';
import { useTheme } from '@/context/ThemeContext';
import type { StayCategory } from '@/constants/tokens';
import {
  edgeCaseListings,
  filledListing,
  highDepositListing,
  lakshmiHostel,
  listings,
  saiKrishnaPG,
  sriSaiDormitory,
  unpricedListing,
  vasaviBachelor,
} from '@/data/listings';

/**
 * Batch 3 — discovery preview.
 *
 * Not a product screen. It renders every discovery component against the mock
 * fixtures so the twelve card combinations, the money edge cases and the two
 * live selectors can be checked on a device, in both themes, before the real
 * Explore and Results screens are built on top of them in Batches 6 and 7.
 */

const BY_CATEGORY: Record<StayCategory, typeof saiKrishnaPG> = {
  PG_HOSTEL: saiKrishnaPG,
  BACHELOR: vasaviBachelor,
  COLIVE: lakshmiHostel,
  HOTEL: sriSaiDormitory,
};

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ gap: space[1] }}>
        <Text variant="eyebrow" color="tertiary">
          {title}
        </Text>
        {note ? (
          <Text variant="caption" color="secondary">
            {note}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  const { colors, space, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.card,
        padding: space[4],
        gap: space[4],
      }}
    >
      {children}
    </View>
  );
}

export default function DiscoveryPreview() {
  const { colors, space, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [category, setCategory] = useState<StayCategory>('PG_HOSTEL');
  const [sharing, setSharing] = useState<string | null>(() =>
    defaultSharingSelection(saiKrishnaPG.sharingOptions ?? []),
  );
  const [chips, setChips] = useState<readonly FilterChip[]>([
    { id: 'rent', label: 'Under ₹10k', active: true, clearable: true },
    { id: 'sharing', label: '2-sharing', active: true, clearable: true },
    { id: 'gender', label: 'Girls only' },
    { id: 'meals', label: 'Meals included' },
    { id: 'attachedBath', label: 'Attached bath' },
  ]);

  const activeCount = chips.filter((chip) => chip.active).length;
  const selectedListing = BY_CATEGORY[category];

  const selectedSharing = useMemo(
    () => (saiKrishnaPG.sharingOptions ?? []).find((option) => option.id === sharing),
    [sharing],
  );

  const toggleChip = (id: string) =>
    setChips((current) =>
      current.map((chip) => (chip.id === id ? { ...chip, active: !chip.active, clearable: true } : chip)),
    );

  const clearChip = (id: string) =>
    setChips((current) =>
      current.map((chip) => (chip.id === id ? { ...chip, active: false, clearable: false } : chip)),
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Discovery"
        subtitle="Batch 3 · listing cards and the money components"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: space[4],
          paddingBottom: space[8],
          gap: space[6],
        }}
      >
        {/* ---------------------------------------------------------- *
         * Money
         * ---------------------------------------------------------- */}
        <View style={{ paddingHorizontal: layout.gutter, gap: space[6] }}>
          <Section
            title="01 · RentDisplay"
            note="One component. Card and detail are the flight pair at 1.3×."
          >
            <Panel>
              <View style={{ gap: space[2] }}>
                <Text variant="numMeta" color="tertiary">
                  size=&quot;card&quot;
                </Text>
                <RentDisplay rent={8500} deposit={17000} depositMonths={2} size="card" sharedTag="rent-demo" />
              </View>
              <View style={{ gap: space[2] }}>
                <Text variant="numMeta" color="tertiary">
                  size=&quot;detail&quot;
                </Text>
                <RentDisplay rent={8500} deposit={17000} depositMonths={2} size="detail" />
              </View>
            </Panel>

            <Panel>
              <Text variant="title3">Edge cases the component owns</Text>
              <RentDisplay rent={6800} deposit={0} size="card" />
              <RentDisplay rent={5500} deposit={5500} depositMonths={1} perBed size="card" />
              <RentDisplay
                rent={300}
                perNight
                secondaryLine="₹7,500/month · min 3 nights"
                deposit={0}
                size="card"
              />
              <RentDisplay rent={null} size="card" />
              <RentDisplay rent={8200} deposit={16400} size="card" struck freshness="filled 20 min ago" />
              <Text variant="caption" color="secondary">
                A missing rent renders as a sentence, never ₹0 and never a dash — the app must not look like it
                is asserting a price it does not have.
              </Text>
            </Panel>

            <MoveInBreakdown
              firstMonthRent={8500}
              deposit={17000}
              quoteNote="quoted 4 min ago · valid 2h"
            />
          </Section>

          <Section
            title="02 · DepositBadge & GenderBadge"
            note="The two things that must never be missed. Neither is carried by colour alone."
          >
            <Panel>
              <DepositBadge amount={0} months={0} />
              <DepositBadge amount={8500} months={1} areaMedianMonths={2} />
              <DepositBadge amount={17000} months={2} areaMedianMonths={2} />
              <DepositBadge amount={36000} months={3} areaMedianMonths={2} />
              <DepositBadge />
              <Text variant="caption" color="secondary">
                &quot;High for this area&quot; only renders when the server supplies the area median. Without it
                the comparison is not drawn at all — a comparison the client invents is a lie.
              </Text>
            </Panel>

            <Panel>
              <View style={[styles.row, { gap: space[2] }]}>
                <GenderBadge gender="BOYS" />
                <GenderBadge gender="GIRLS" />
                <GenderBadge gender="COED" />
              </View>
              <GenderBadge gender="GIRLS" matchesUser={false} />
              <Text variant="caption" color="secondary">
                Arriving at a girls&apos; PG as a boy is a trust failure, not a filtering preference — so a
                mismatch is stated on the card rather than quietly sorted down the list.
              </Text>
            </Panel>
          </Section>
        </View>

        {/* ---------------------------------------------------------- *
         * Categories and cards
         * ---------------------------------------------------------- */}
        <Section title="03 · CategoryTabs" note="Tap a category — the card below changes shape with it.">
          <CategoryTabs value={category} onChange={setCategory} />
          <View style={{ paddingHorizontal: layout.gutter }}>
            <Text variant="body" color="secondary">
              {CATEGORY_BLURB[category]}
            </Text>
          </View>
        </Section>

        <Section title="04 · ListingCard · carousel">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: space[3] }}
          >
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} variant="carousel" onPress={() => {}} onToggleSave={() => {}} />
            ))}
            <ListingCardSkeleton variant="carousel" />
          </ScrollView>
        </Section>

        <View style={{ paddingHorizontal: layout.gutter, gap: space[6] }}>
          <Section
            title="05 · ListingCard · list"
            note="The default in results. The photo block is a fixed 112 × 118 in every category, so the list never reflows as data arrives."
          >
            <View style={{ gap: space[3] }}>
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} variant="list" onPress={() => {}} onToggleSave={() => {}} />
              ))}
              <ListingCard listing={unpricedListing} variant="list" onPress={() => {}} onToggleSave={() => {}} />
              <ListingCard listing={filledListing} variant="list" />
              <ListingCard
                listing={highDepositListing}
                variant="list"
                onPress={() => {}}
                onToggleSave={() => {}}
              />
              <ListingCardSkeleton variant="list" />
            </View>
            <Text variant="caption" color="secondary">
              A place that fills while you browse is not deleted from under your thumb. It dims, strikes its
              price, timestamps itself and offers an alert.
            </Text>
          </Section>


          <Section
            title="07 · SharingTypeSelector"
            note="Every price is per person, per month — the header says it and every row repeats it."
          >
            <Panel>
              <SharingTypeSelector
                options={saiKrishnaPG.sharingOptions ?? []}
                value={sharing}
                onChange={setSharing}
                note="Deposit is two months of whichever sharing you pick."
              />
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />
              <View style={{ gap: space[2] }}>
                <Text variant="numMeta" color="tertiary">
                  what the CTA bar would show
                </Text>
                {selectedSharing ? (
                  <RentDisplay
                    rent={selectedSharing.pricePerPerson ?? null}
                    deposit={selectedSharing.deposit}
                    depositMonths={selectedSharing.depositMonths}
                    perBed
                    size="bar"
                  />
                ) : (
                  <Text variant="caption" color="secondary">
                    Nothing selected, so the CTA stays disabled. A pre-selected sharing type the user did not
                    choose is a price they did not agree to.
                  </Text>
                )}
              </View>
            </Panel>

            <Panel>
              <SharingTypeSelector
                options={sriSaiDormitory.sharingOptions ?? []}
                value="hall"
                onChange={() => {}}
                note="A dormitory has one option, so the selector collapses rather than offering a false choice."
              />
            </Panel>
          </Section>

          <Section
            title="08 · AmenityIcon"
            note="Present, absent and qualified. The qualifier is the whole value — WiFi is a claim, WiFi · 40 Mbps is a fact."
          >
            <Panel>
              <AmenityGrid amenities={saiKrishnaPG.amenities ?? []} category={saiKrishnaPG.category} />
            </Panel>
          </Section>

          <Section
            title="Getting there"
            note="There is no map in this app — it hands off to Google Maps, which the student already has and already trusts. A public listing only ever gives it a landmark; the exact address arrives with a paid booking."
          >
            <Panel>
              <DirectionsButton
                place={{ label: `${saiKrishnaPG.landmark}, ${saiKrishnaPG.locality}` }}
                landmark={saiKrishnaPG.landmark}
              />
            </Panel>
          </Section>

          <Section title="09 · MealPlanCard · HouseRulesRow" note="Facts, not warnings.">
            <MealPlanCard plan={saiKrishnaPG.meals!} />
            <Panel>
              <HouseRulesRow rules={saiKrishnaPG.houseRules ?? []} />
            </Panel>
          </Section>
        </View>

        {/* ---------------------------------------------------------- *
         * Filters
         * ---------------------------------------------------------- */}
        <Section
          title="10 · FilterChipRow"
          note="Sticky under the search header. The Filters button never scrolls out of reach."
        >
          <FilterChipRow
            chips={chips}
            onPressChip={toggleChip}
            onClearChip={clearChip}
            onPressFilters={() => {}}
            activeCount={activeCount}
          />
        </Section>

        <View style={{ paddingHorizontal: layout.gutter, gap: space[6] }}>
          <Section title="Selected category" note="The card the tabs above are driving.">
            <ListingCard listing={selectedListing} variant="carousel" onPress={() => {}} onToggleSave={() => {}} />
            <Text variant="caption" color="secondary">
              {edgeCaseListings.length} edge-case fixtures ship alongside the four categories: no rent set, filled
              while browsing, and a deposit above the area median.
            </Text>
          </Section>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
