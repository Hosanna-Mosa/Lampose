import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Screen,
  TopHeader,
  Text,
  Button,
  TextButton,
  IconButton,
  Input,
  Card,
  Divider,
  Badge,
  BookingStatusBadge,
  PaymentStatusBadge,
  Icon,
  Skeleton,
  SkeletonCard,
  EmptyState,
  ErrorState,
  type IconName,
} from '@/components/ui';
import { type TypeVariant, type as typeScale } from '@/constants/typography';
import { layout, radius } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';
import type { Palette } from '@/constants/colors';

/**
 * Foundation reference — every primitive from checkpoint 00 in each of its
 * states. Build-time only; delete before ship.
 */
export default function DesignSystemScreen() {
  const c = useColors();
  const [text, setText] = useState('');

  return (
    <Screen header={<TopHeader title="Design system" showBack />} background="bg">
      <Section title="Color">
        <Text variant="caption" color="textSecondary" style={styles.note}>
          Converted from the oklch values in the design system. Two foregrounds are darkened from
          the source to clear WCAG AA — marked below.
        </Text>
        <Swatches
          items={[
            ['bg', 'bg'],
            ['surface', 'surface'],
            ['surfaceSunken', 'surfaceSunken'],
            ['borderSubtle', 'borderSubtle'],
            ['border', 'border'],
            ['textTertiary', 'textTertiary'],
            ['textSecondary', 'textSecondary'],
            ['textPrimary', 'textPrimary'],
          ]}
        />
        <Swatches
          items={[
            ['accent', 'accent'],
            ['accentHover', 'accentHover'],
            ['accentTint', 'accentTint'],
            ['success', 'success'],
            ['warning', 'warning'],
            ['error', 'error'],
            ['info', 'info'],
          ]}
        />
      </Section>

      <Section title="Type scale">
        <Card>
          {(
            [
              'display',
              'pageTitle',
              'screenTitle',
              'h3',
              'bodyMedium',
              'body',
              'caption',
              'label',
              'overline',
              'mono',
            ] as TypeVariant[]
          ).map((v, i) => (
            <View key={v}>
              {i > 0 ? <Divider style={styles.rule} /> : null}
              <View style={styles.typeRow}>
                <Text variant={v} style={styles.typeSample} numberOfLines={1}>
                  {v === 'overline' ? 'Overline label' : 'Sea View Villa'}
                </Text>
                <Text variant="mono" color="textTertiary">
                  {typeScale[v].fontSize}/{typeScale[v].lineHeight}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Buttons">
        <View style={styles.stack}>
          <Button label="Accept request" />
          <Button label="Secondary" variant="secondary" />
          <Button label="Cancel booking" variant="destructive" />
          <Button label="Disabled" disabled />
          <Button label="Verifying…" loading />
          <View style={styles.inline}>
            <Button label="Small" size="sm" fullWidth={false} />
            <Button label="Small outline" size="sm" variant="secondary" fullWidth={false} />
            <TextButton label="Resend code" />
          </View>
          <View style={styles.inline}>
            <IconButton name="edit" label="Edit" color={c.textTertiary} />
            <IconButton name="trash" label="Delete" color={c.error} />
            <Text variant="caption" color="textSecondary" style={styles.flex}>
              Icon buttons claim 44×44 even where the design draws them at 16px.
            </Text>
          </View>
        </View>
      </Section>

      <Section title="Inputs">
        <View style={styles.stack}>
          <Input label="Nightly rate" prefix="₹" placeholder="3,200" keyboardType="number-pad" />
          <Input
            label="Full name"
            value={text}
            onChangeText={setText}
            placeholder="Tap to see the focus ring"
          />
          <Input label="Check-in date" value="31/02/2026" error="Enter a date that exists." />
          <Input label="Cleaning fee" value="Set by platform" disabled />
          <Input label="Email" optional placeholder="you@email.com" keyboardType="email-address" />
          <Input label="Description" placeholder="Describe what happened…" multiline />
        </View>
      </Section>

      <Section title="Badges">
        <Text variant="caption" color="textSecondary" style={styles.note}>
          Booking state is a tint pill; payment state is a solid rect with an icon. They appear side
          by side and are never merged.
        </Text>
        <View style={styles.wrapRow}>
          <BookingStatusBadge status="confirmed" />
          <BookingStatusBadge status="pending" />
          <BookingStatusBadge status="inHouse" />
          <BookingStatusBadge status="completed" />
          <BookingStatusBadge status="cancelled" />
          <BookingStatusBadge status="declined" />
          <BookingStatusBadge status="draft" />
        </View>
        <View style={styles.wrapRow}>
          <PaymentStatusBadge status="paid" />
          <PaymentStatusBadge status="pending" />
          <PaymentStatusBadge status="failed" />
          <PaymentStatusBadge status="refunded" />
        </View>
        <View style={styles.wrapRow}>
          <Badge label="Open" tone="warning" />
          <Badge label="In progress" tone="accent" />
          <Badge label="Resolved" tone="success" />
        </View>
      </Section>

      <Section title="Cards">
        <Card variant="elevated" style={styles.demoCard}>
          <View style={styles.cardHead}>
            <Text variant="cardTitle">Sea View Villa · 204</Text>
            <BookingStatusBadge status="confirmed" />
          </View>
          <Text variant="caption" color="textSecondary">
            Aug 18 – Aug 21 · 2 guests
          </Text>
          <Divider style={styles.rule} />
          <View style={styles.cardHead}>
            <Text variant="caption" color="textSecondary">
              Payout
            </Text>
            <Text variant="cardTitle" tabular>
              ₹9,600
            </Text>
          </View>
        </Card>
        <Card style={styles.demoCard}>
          <Text variant="overline" color="textSecondary">
            This month
          </Text>
          <Text variant="display" tabular>
            ₹1,84,200
          </Text>
          <Text variant="link" color="successOnTint">
            ↑ 12% vs last month
          </Text>
        </Card>
      </Section>

      <Section title="Four states">
        <Text variant="caption" color="textSecondary" style={styles.note}>
          Identical container geometry across all four, so the layout never jumps as data resolves.
        </Text>
        <View style={styles.stack}>
          <SkeletonCard />
          <Card style={styles.stateBox}>
            <EmptyState
              title="No bookings yet"
              body="New reservations for this listing will show up here."
            />
          </Card>
          <Card style={styles.stateBox}>
            <ErrorState title="Couldn't load bookings" onRetry={() => {}} />
          </Card>
          <View style={styles.inline}>
            <Skeleton width={90} height={14} />
            <Skeleton width={54} height={10} />
          </View>
        </View>
      </Section>

      <Section title="Icons">
        <View style={styles.iconGrid}>
          {(
            [
              'home',
              'bookings',
              'calendar',
              'wallet',
              'menu',
              'chevron-left',
              'chevron-right',
              'chevron-down',
              'check',
              'check-circle',
              'alert-circle',
              'info',
              'clock',
              'plus',
              'close',
              'edit',
              'trash',
              'send',
              'upload',
              'refresh',
              'search',
              'filter',
              'bell',
              'message',
              'star',
              'star-outline',
              'map-pin',
              'image',
              'lock',
              'user',
              'users',
              'settings',
              'log-out',
              'bank',
              'rupee',
              'bed',
              'crosshair',
              'grip',
              'arrow-up',
            ] as IconName[]
          ).map((n) => (
            <View key={n} style={[styles.iconCell, { borderColor: c.borderCard }]}>
              <Icon name={n} size={22} color={n === 'star' || n === 'map-pin' ? c.warning : undefined} />
            </View>
          ))}
        </View>
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="screenTitle" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Swatches({ items }: { items: [string, keyof Palette][] }) {
  const c = useColors();
  return (
    <View style={styles.wrapRow}>
      {items.map(([label, token]) => (
        <View key={label} style={styles.swatch}>
          <View
            style={[
              styles.chipColor,
              { backgroundColor: c[token] as string, borderColor: c.borderCard },
            ]}
          />
          <Text variant="mono" color="textSecondary" style={styles.swatchLabel}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: layout.sectionGap },
  sectionTitle: { marginBottom: 12 },
  note: { marginBottom: 12 },
  stack: { gap: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  flex: { flex: 1 },
  rule: { marginVertical: 10 },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  typeSample: { flex: 1 },
  demoCard: { gap: 4, marginBottom: 12 },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stateBox: { height: 200, padding: 0 },
  swatch: { width: 76, gap: 4 },
  chipColor: { height: 44, borderRadius: radius.chip, borderWidth: 1 },
  swatchLabel: { fontSize: 10 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconCell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
