import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Box } from '@/components/common';
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
} from '@/components/common';
import { type TypeVariant, type as typeScale } from '@/constants/typography';
import { layout, radius } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';
import { Section } from '@/components/design-system/molecules/Section/Section';
import { Swatches } from '@/components/design-system/molecules/Swatches/Swatches';
import { styles } from '@/components/design-system/styles';

/**
 * Foundation reference — every primitive from checkpoint 00 in each of its
 * states. Build-time only; delete before ship.
 */
export function DesignSystemScreen() {
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
            <Box key={v}>
              {i > 0 ? <Divider style={styles.rule} /> : null}
              <Box style={styles.typeRow}>
                <Text variant={v} style={styles.typeSample} numberOfLines={1}>
                  {v === 'overline' ? 'Overline label' : 'Sea View Villa'}
                </Text>
                <Text variant="mono" color="textTertiary">
                  {typeScale[v].fontSize}/{typeScale[v].lineHeight}
                </Text>
              </Box>
            </Box>
          ))}
        </Card>
      </Section>

      <Section title="Buttons">
        <Box style={styles.stack}>
          <Button label="Accept request" />
          <Button label="Secondary" variant="secondary" />
          <Button label="Cancel booking" variant="destructive" />
          <Button label="Disabled" disabled />
          <Button label="Verifying…" loading />
          <Box style={styles.inline}>
            <Button label="Small" size="sm" fullWidth={false} />
            <Button label="Small outline" size="sm" variant="secondary" fullWidth={false} />
            <TextButton label="Resend code" />
          </Box>
          <Box style={styles.inline}>
            <IconButton name="edit" label="Edit" color={c.textTertiary} />
            <IconButton name="trash" label="Delete" color={c.error} />
            <Text variant="caption" color="textSecondary" style={styles.flex}>
              Icon buttons claim 44×44 even where the design draws them at 16px.
            </Text>
          </Box>
        </Box>
      </Section>

      <Section title="Inputs">
        <Box style={styles.stack}>
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
        </Box>
      </Section>

      <Section title="Badges">
        <Text variant="caption" color="textSecondary" style={styles.note}>
          Booking state is a tint pill; payment state is a solid rect with an icon. They appear side
          by side and are never merged.
        </Text>
        <Box style={styles.wrapRow}>
          <BookingStatusBadge status="confirmed" />
          <BookingStatusBadge status="pending" />
          <BookingStatusBadge status="inHouse" />
          <BookingStatusBadge status="completed" />
          <BookingStatusBadge status="cancelled" />
          <BookingStatusBadge status="declined" />
          <BookingStatusBadge status="draft" />
        </Box>
        <Box style={styles.wrapRow}>
          <PaymentStatusBadge status="paid" />
          <PaymentStatusBadge status="pending" />
          <PaymentStatusBadge status="failed" />
          <PaymentStatusBadge status="refunded" />
        </Box>
        <Box style={styles.wrapRow}>
          <Badge label="Open" tone="warning" />
          <Badge label="In progress" tone="accent" />
          <Badge label="Resolved" tone="success" />
        </Box>
      </Section>

      <Section title="Cards">
        <Card variant="elevated" style={styles.demoCard}>
          <Box style={styles.cardHead}>
            <Text variant="cardTitle">Sea View Villa · 204</Text>
            <BookingStatusBadge status="confirmed" />
          </Box>
          <Text variant="caption" color="textSecondary">
            Aug 18 – Aug 21 · 2 guests
          </Text>
          <Divider style={styles.rule} />
          <Box style={styles.cardHead}>
            <Text variant="caption" color="textSecondary">
              Payout
            </Text>
            <Text variant="cardTitle" tabular>
              ₹9,600
            </Text>
          </Box>
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
        <Box style={styles.stack}>
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
          <Box style={styles.inline}>
            <Skeleton width={90} height={14} />
            <Skeleton width={54} height={10} />
          </Box>
        </Box>
      </Section>

      <Section title="Icons">
        <Box style={styles.iconGrid}>
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
            <Box key={n} style={[styles.iconCell, { borderColor: c.borderCard }]}>
              <Icon name={n} size={22} color={n === 'star' || n === 'map-pin' ? c.warning : undefined} />
            </Box>
          ))}
        </Box>
      </Section>
    </Screen>
  );
}

