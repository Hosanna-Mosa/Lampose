import { Link, Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { usePreviewControls } from '@/hooks/useAppEnv';
import { useTheme, type ThemePreference } from '@/context/ThemeContext';
import {
  bookingStatus,
  phaseColors,
  typeScale,
  type BookingStatus,
  type StayCategory,
  type TypeVariant,
} from '@/constants/tokens';

/**
 * The design-system preview sheets.
 *
 * Not a product screen, and no longer the app's entry point — the app boots
 * into the real flow at `app/index.tsx`. This renders the token set so the
 * visual direction can be checked on a device in both themes, and links to the
 * sheet each batch shipped.
 */

const TYPE_SPECIMENS: { variant: TypeVariant; sample: string }[] = [
  { variant: 'display1', sample: 'Find a place' },
  { variant: 'display2', sample: 'Find a place' },
  { variant: 'title1', sample: 'Sunrise Ladies PG' },
  { variant: 'title2', sample: 'Sunrise Ladies PG' },
  { variant: 'title3', sample: 'Sunrise Ladies PG' },
  { variant: 'bodyLg', sample: 'Two sharing, attached bathroom, meals included.' },
  { variant: 'body', sample: 'Two sharing, attached bathroom, meals included.' },
  { variant: 'bodyStrong', sample: 'Two sharing, attached bathroom.' },
  { variant: 'caption', sample: 'Notice period is one month.' },
  { variant: 'label', sample: 'Refundable' },
  { variant: 'eyebrow', sample: 'Deposit' },
  { variant: 'priceHero', sample: '₹8,500' },
  { variant: 'priceLg', sample: '₹8,500' },
  { variant: 'priceMd', sample: '₹8,500' },
  { variant: 'priceSm', sample: '₹8,500' },
  { variant: 'numMeta', sample: '12 min to campus' },
];

const CATEGORIES: StayCategory[] = ['PG_HOSTEL', 'PG_HOSTEL', 'BACHELOR', 'HOTEL'];

const STATUSES: BookingStatus[] = [
  'REQUESTED',
  'ACCEPTED',
  'PAYMENT_PENDING',
  'CONFIRMED',
  'COMPLETED',
  'REJECTED',
  'PAYMENT_FAILED',
  'DISPUTED',
];

const PREFERENCES: ThemePreference[] = ['light', 'system', 'dark'];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const { colors, space: sp } = useTheme();
  return (
    <View style={{ gap: sp[3] }}>
      <View style={{ gap: sp[1] }}>
        <Text variant="eyebrow" color="tertiary">
          {title}
        </Text>
        {note ? (
          <Text variant="caption" color="secondary">
            {note}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: 16,
          padding: sp[4],
          gap: sp[3],
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Swatch({ name, value, ink }: { name: string; value: string; ink?: string }) {
  const { colors, space: sp, radius } = useTheme();
  return (
    <View style={{ gap: sp[1], flex: 1, minWidth: 96 }}>
      <View
        style={{
          height: 48,
          borderRadius: radius.chip,
          backgroundColor: value,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {ink ? (
          <Text variant="label" style={{ color: ink }}>
            Aa
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="secondary">
        {name}
      </Text>
      <Text variant="numMeta" color="tertiary">
        {value}
      </Text>
    </View>
  );
}

export default function DesignSystemPreview() {
  const previewControls = usePreviewControls();
  const { colors, space: sp, radius, mode, preference, setPreference, reduceMotion, layout } = useTheme();
  const insets = useSafeAreaInsets();

  /*
   * Gone in a production build.
   *
   * Deleting the file would be the other way, but this is a route in a
   * file-based router: `app/preview.tsx` IS the URL, so as long as the file
   * exists the screen is one `lampose://preview` away on any handset,
   * whatever links to it. Nothing in the product does — but a route does not
   * need a link to be reachable, only an address, and it has one.
   *
   * Redirect rather than render nothing, so a stale link lands somewhere real
   * instead of on a blank screen that looks like a crash.
   */
  if (!previewControls) return <Redirect href="/home" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + sp[4],
          paddingBottom: insets.bottom + sp[8],
          paddingHorizontal: layout.gutter,
          gap: sp[6],
        }}
      >
        <View style={{ gap: sp[2] }}>
          <Text variant="eyebrow" color="brand">
            Design system · batches 0–5
          </Text>
          <Text variant="display2">Foundation</Text>
          <Text variant="body" color="secondary">
            Tokens, type scale and motion system. Every screen built after this one reads its
            colours, sizes and spacing from here.
          </Text>
        </View>

        {/* Theme switch — the fastest way to check both palettes hold up. */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.button,
            padding: sp[1],
            gap: sp[1],
          }}
        >
          {PREFERENCES.map((option) => {
            const active = preference === option;
            return (
              <Pressable
                key={option}
                onPress={() => setPreference(option)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${option} theme`}
                style={{
                  flex: 1,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.chip,
                  backgroundColor: active ? colors.surface : 'transparent',
                }}
              >
                <Text variant="bodyStrong" color={active ? 'primary' : 'secondary'}>
                  {option[0].toUpperCase() + option.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Section
          title="Type scale"
          note="Sixteen named styles. A screen names one of these — it never sets a size."
        >
          {TYPE_SPECIMENS.map(({ variant, sample }) => {
            const token = typeScale[variant];
            return (
              <View key={variant} style={{ gap: sp[1], paddingVertical: sp[1] }}>
                <Text variant="numMeta" color="tertiary">
                  {variant} · {token.size}/{token.weight} · {token.face}
                </Text>
                <Text variant={variant}>{sample}</Text>
              </View>
            );
          })}
        </Section>

        <Section title="Ground and ink">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp[3] }}>
            <Swatch name="bg" value={colors.bg} ink={colors.textPrimary} />
            <Swatch name="surface" value={colors.surface} ink={colors.textPrimary} />
            <Swatch name="surfaceSunken" value={colors.surfaceSunken} ink={colors.textSecondary} />
            <Swatch name="graphite" value={colors.graphite} ink={colors.onGraphite} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp[3] }}>
            <Swatch name="brand" value={colors.brand} ink="#FFFFFF" />
            <Swatch name="brandTint" value={colors.brandTint} ink={colors.info.ink} />
            <Swatch name="brandOnDark" value={colors.graphite} ink={colors.brandOnDark} />
          </View>
          <Text variant="caption" color="secondary">
            Brand ink is the one token that cannot be shared across modes. On graphite, always
            brandOnDark — the light-mode brand measures about 1.9:1 there and is unreadable.
          </Text>
        </Section>

        <Section title="Category" note="Each category leads with a different fact.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp[2] }}>
            {CATEGORIES.map((key) => {
              const category = colors.category[key];
              return (
                <View
                  key={key}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: sp[2],
                    backgroundColor: category.tint,
                    borderColor: category.mark,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderRadius: radius.chip,
                    paddingHorizontal: sp[3],
                    paddingVertical: sp[2],
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: radius.pill,
                      backgroundColor: category.mark,
                    }}
                  />
                  <Text variant="label" style={{ color: category.ink }}>
                    {key}
                  </Text>
                </View>
              );
            })}
          </View>
        </Section>

        <Section
          title="Booking status"
          note="Phase drives the colour, but the glyph and the words carry the meaning on their own."
        >
          <View style={{ gap: sp[2] }}>
            {STATUSES.map((key) => {
              const status = bookingStatus[key];
              const phase = phaseColors(colors, status.phase);
              return (
                <View
                  key={key}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: sp[3],
                    backgroundColor: phase.tint,
                    borderColor: phase.border,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderRadius: radius.chip,
                    paddingHorizontal: sp[3],
                    paddingVertical: sp[2],
                    minHeight: 44,
                  }}
                >
                  <Text variant="bodyStrong" style={{ color: phase.ink }}>
                    {status.label}
                    {status.actor ? ` ${status.actor}` : ''}
                  </Text>
                  <Text variant="numMeta" style={{ color: phase.ink }}>
                    {status.phase}
                  </Text>
                </View>
              );
            })}
          </View>
        </Section>

        <Section title="Radius" note="Four values and a pill. Chosen by what a thing is, not its size.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp[3] }}>
            {(['chip', 'button', 'card', 'sheet'] as const).map((key) => (
              <View key={key} style={{ gap: sp[1], alignItems: 'center' }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: radius[key],
                    backgroundColor: colors.surfaceSunken,
                    borderColor: colors.border,
                    borderWidth: StyleSheet.hairlineWidth,
                  }}
                />
                <Text variant="caption" color="secondary">
                  {key}
                </Text>
                <Text variant="numMeta" color="tertiary">
                  {radius[key]}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Batch sheets" note="Each batch ships a screen that exercises what it added.">
          {/* `as const` keeps the hrefs as literal types. Typed routes are on,
              so a widened `string` is not a valid Href. */}
          {(
            [
              { href: '/primitives', label: 'Batch 1 · Primitives' },
              { href: '/shell', label: 'Batch 2 · Shell' },
              { href: '/discovery', label: 'Batch 3 · Discovery' },
              { href: '/booking', label: 'Batch 4 · Booking' },
              { href: '/(entry)/splash', label: 'Batch 5 · Entry flow' },
              { href: '/home', label: 'Back to the app' },
            ] as const
          ).map((sheet) => (
            <Link key={sheet.href} href={sheet.href} asChild>
              <Pressable
                accessibilityRole="link"
                style={{
                  minHeight: 52,
                  borderRadius: radius.button,
                  backgroundColor: colors.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
                  {sheet.label}
                </Text>
              </Pressable>
            </Link>
          ))}
        </Section>

        <Section title="Motion">
          <Text variant="body" color="secondary">
            Reduce motion is currently{' '}
            <Text variant="bodyStrong" color={reduceMotion ? 'warning' : 'primary'}>
              {reduceMotion ? 'on' : 'off'}
            </Text>
            . When on, movement is removed but legibility motion still runs — a header solidifying
            over a photo and a timer changing colour are information, not decoration.
          </Text>
        </Section>
      </ScrollView>
    </View>
  );
}
