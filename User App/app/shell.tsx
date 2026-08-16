import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { Card, Divider, SegmentedControl, Text } from '@/components/ui';
import {
  DetailSkeleton,
  ExploreHeader,
  ListSkeleton,
  PHOTO_HERO_HEIGHT,
  PhotoHeader,
  PhotoHero,
  SearchHeader,
  StandardHeader,
  StateTemplate,
  StickyCtaBar,
  SuccessState,
  TabBar,
  type TabItem,
} from '@/components/shell';
import { emptyStates, errorStates, successCopy } from '@/constants/copy';
import { useTheme } from '@/context/ThemeContext';
import { actions } from '@/constants/actions';

/**
 * Batch 2 — shell preview.
 *
 * Not a product screen. Exercises the tab bar, all five headers, the CTA bar
 * and the four state templates with their real copy.
 */

const TABS: TabItem[] = [
  { id: 'explore', label: 'Explore', icon: 'search' },
  { id: 'bookings', label: 'Bookings', icon: 'calendar' },
  { id: 'alerts', label: 'Alerts', icon: 'clock', badge: 3 },
  { id: 'profile', label: 'Profile', icon: 'sharing', dot: true },
];

const VIEWS = ['Headers', 'CTA bar', 'States', 'Photo'] as const;

export default function ShellPreview() {
  const { colors, space, layout } = useTheme();
  const [tab, setTab] = useState('explore');
  const [view, setView] = useState<(typeof VIEWS)[number]>('Headers');
  const [sharing, setSharing] = useState(2);
  const [barHeight, setBarHeight] = useState(120);
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    // Straight to a shared value. No setState anywhere in the threshold logic.
    scrollY.value = event.contentOffset.y;
  });

  const rents: Record<number, number> = { 1: 14000, 2: 8500, 3: 6800, 4: 5500 };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {view === 'Photo' ? (
          <>
            <PhotoHeader
              title="Sai Krishna Boys PG"
              scrollY={scrollY}
              onBack={() => setView('Headers')}
              onAction={() => {}}
              actionIcon="bookmark"
            />
            <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
              <PhotoHero scrollY={scrollY}>
                <View style={{ height: PHOTO_HERO_HEIGHT, backgroundColor: colors.surfaceSunken }} />
              </PhotoHero>
              <View style={{ padding: layout.gutter, gap: space[4], paddingBottom: barHeight + space[6] }}>
                <Text variant="title1">Sai Krishna Boys PG</Text>
                <Text variant="body" color="secondary">
                  Gachibowli · 22 min to IIIT-H · boys only · 2 meals
                </Text>
                <Text variant="caption" color="tertiary">
                  Scroll up and down — the header crosses its threshold and the title swaps in. The
                  scrim is a top-down gradient, so there is no terminating edge partway down the hero.
                </Text>
                {Array.from({ length: 12 }).map((_, index) => (
                  <View key={index} style={{ gap: space[2] }}>
                    <Text variant="bodyStrong">Filler row {index + 1}</Text>
                    <Divider />
                  </View>
                ))}
              </View>
            </Animated.ScrollView>
            <StickyCtaBar
              label={actions.requestBed}
              onPress={() => {}}
              rent={rents[sharing]}
              deposit={17000}
              depositMonths={2}
              note="price updated 6 min ago · held for 2h once you request"
              onMeasure={setBarHeight}
            />
          </>
        ) : (
          <ScrollView
            contentContainerStyle={{
              paddingBottom: space[8] * 2,
              gap: space[6],
            }}
          >
            <View style={{ paddingHorizontal: layout.gutter, paddingTop: space[6], gap: space[3] }}>
              <Text variant="eyebrow" color="brand">
                Batch 2 of 12
              </Text>
              <Text variant="display2">Shell</Text>
              <SegmentedControl options={VIEWS} value={view} onChange={setView} accessibilityLabel="Preview" />
            </View>

            {view === 'Headers' ? (
              <View style={{ gap: space[4] }}>
                <Label text="(a) explore — locality selector + bell" />
                <ExploreHeader
                  locality="Gachibowli"
                  city="Hyderabad"
                  onPressLocality={() => {}}
                  onPressAlerts={() => {}}
                  alertCount={3}
                />

                <Label text="(b) standard — back + title, left-aligned" />
                <StandardHeader
                  title="Payment"
                  subtitle="Sai Krishna Boys PG · Two-sharing · ₹8,500/month"
                  onBack={() => {}}
                />

                <Label text="(d) search — collapsed criteria, both ceilings visible" />
                <SearchHeader
                  query="Gachibowli · PG · Boys"
                  constraints="Up to ₹10,000 · deposit ₹20,000 · 2-sharing"
                  onPress={() => {}}
                  onBack={() => {}}
                  filterCount={5}
                />

                <Label text="(e) right-side action — text or icon, never both" />
                <StandardHeader title="Saved places" onBack={() => {}} actionLabel="Edit" onAction={() => {}} />
              </View>
            ) : null}

            {view === 'CTA bar' ? (
              <View style={{ paddingHorizontal: layout.gutter, gap: space[5] }}>
                <Text variant="body" color="secondary">
                  Change the sharing type and watch the price swap. The old value fades out while the
                  new one fades in from t=70ms, so the slot is never empty — and tabular digits hold
                  the width, so nothing shifts.
                </Text>
                <SegmentedControl
                  options={['1', '2', '3', '4'] as const}
                  value={String(sharing)}
                  onChange={(next) => setSharing(Number(next))}
                  accessibilityLabel="Sharing type"
                />
                <Card raised style={{ padding: space[4] }}>
                  <Text variant="caption" color="secondary">
                    The live bar is pinned at the bottom of this screen.
                  </Text>
                </Card>
              </View>
            ) : null}

            {view === 'States' ? (
              <View style={{ gap: space[6] }}>
                <Label text="skeleton · list layout" />
                <ListSkeleton count={2} />

                <Label text="skeleton · detail layout" />
                <DetailSkeleton />

                <Label text="empty · no search results" />
                <StateTemplate
                  copy={emptyStates.noSearchResults({
                    locality: 'Gachibowli',
                    rentCeiling: '₹8,000',
                    fittingCount: 14,
                    suggestedCeiling: '₹9,500',
                    nearbyCount: 9,
                    nearbyLocality: 'Kondapur',
                        })}
                  onPrimary={() => {}}
                  onSecondary={() => {}}
                />

                <Label text="empty · no notifications (calm — secondary action)" />
                <StateTemplate copy={emptyStates.noNotifications()} onPrimary={() => {}} />

                <Label text="error · listing taken (no red — the market moved)" />
                <StateTemplate
                  copy={errorStates.listingTaken({
                    filledMinutesAgo: 20,
                    alternativeCount: 6,
                    sharingType: 'two-sharing',
                    locality: 'Gachibowli',
                    priceLow: '₹8,200',
                    priceHigh: '₹9,000',
                              })}
                  onPrimary={() => {}}
                  onSecondary={() => {}}
                />

                <Label text="error · payment unverified — 'do not pay again' runs first" />
                <StateTemplate
                  copy={errorStates.paymentUnverified({ amount: '₹25,500', holdUntil: '6:40 pm' })}
                  onPrimary={() => {}}
                  onSecondary={() => {}}
                  tone="error"
                  footnote="Booking LAM-4192"
                />

                <Label text="error · server 5xx — says whose fault it is" />
                <StateTemplate
                  copy={errorStates.serverError({ status: 503, requestId: 'a41f92' })}
                  onPrimary={() => {}}
                />

                <Label text="success · after payment clears" />
                <SuccessState
                  {...successCopy.bedConfirmed({
                    propertyName: 'Sai Krishna Boys PG',
                    sharingType: 'two-sharing',
                    moveInDate: '5 September',
                    arriveBy: '7 pm',
                  })}
                  rows={[
                    { label: 'Booking', value: 'LAM-4192' },
                    { label: 'Paid now', value: '₹25,500' },
                    { label: 'Refundable deposit', value: '₹17,000', refundable: true },
                  ]}
                  onPrimary={() => {}}
                  onSecondary={() => {}}
                />
              </View>
            ) : null}
          </ScrollView>
        )}

        {view === 'CTA bar' ? (
          <StickyCtaBar
            label={actions.requestBed}
            onPress={() => {}}
            rent={rents[sharing]}
            deposit={17000}
            depositMonths={2}
            note="price updated 6 min ago · held for 2h once you request"
          />
        ) : null}

        {view !== 'Photo' && view !== 'CTA bar' ? (
          <TabBar tabs={TABS} activeId={tab} onChange={setTab} />
        ) : null}
      </View>
    </>
  );
}

function Label({ text }: { text: string }) {
  const { layout } = useTheme();
  return (
    <View style={{ paddingHorizontal: layout.gutter }}>
      <Text variant="numMeta" color="tertiary">
        {text}
      </Text>
    </View>
  );
}

