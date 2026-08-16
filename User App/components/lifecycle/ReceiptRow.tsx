import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import type { Receipt } from '@/types/booking';

/**
 * One document.
 *
 * Two things this row must never do.
 *
 * **It must not say "being prepared" without a date.** An undated pending
 * document is indistinguishable from a forgotten one, and the student has no
 * way to tell which it is except by asking support. So a pending receipt states
 * its own deadline and looks visibly unfinished — dashed border, no chevron,
 * not tappable — rather than looking like a normal row that happens to fail.
 *
 * **It must not offer to download.** The published artifact's sandbox blocks
 * page-initiated saves, and on device an "Open" that shares the PDF through the
 * OS sheet is the honest verb: the student then saves it wherever they actually
 * keep documents. "Download" promises a file in a place we do not control.
 */

export type ReceiptRowProps = {
  receipt: Receipt;
  onOpen?: () => void;
  /** Drops the divider, so the list does not end on a hanging rule. */
  last?: boolean;
};

export function ReceiptRow({ receipt, onOpen, last = false }: ReceiptRowProps) {
  const { colors, space, radius, touch } = useTheme();
  const pending = Boolean(receipt.pendingUntilLabel);

  const body = (
    <>
      <View
        style={[
          styles.badge,
          {
            borderRadius: radius.chip,
            backgroundColor: pending ? 'transparent' : colors.surfaceSunken,
            borderColor: colors.border,
            borderWidth: pending ? StyleSheet.hairlineWidth : 0,
            borderStyle: pending ? 'dashed' : 'solid',
          },
        ]}
      >
        {pending ? (
          <Text variant="numMeta" color="tertiary">
            ···
          </Text>
        ) : (
          <Text variant="numMeta" color="secondary">
            PDF
          </Text>
        )}
      </View>

      <View style={[styles.flex, { gap: 2 }]}>
        <Text variant="body" color={pending ? 'secondary' : 'primary'}>
          {receipt.title}
        </Text>
        <Text variant="numMeta" color="tertiary">
          {receipt.meta}
          {receipt.pageCount ? ` · ${receipt.pageCount} pages` : ''}
        </Text>
        {/* The deadline. This is the whole reason a pending row is allowed to
            exist rather than being hidden until it is ready. */}
        {pending ? (
          <Text variant="caption" color="secondary">
            {receipt.pendingUntilLabel}
          </Text>
        ) : null}
      </View>

      {receipt.amount != null ? (
        <Text variant="priceSm" color={pending ? 'tertiary' : 'primary'}>
          {formatRupees(receipt.amount)}
        </Text>
      ) : null}

      {pending ? null : <Icon name="chevronRight" size={20} color={colors.textTertiary} />}
    </>
  );

  if (pending) {
    // Not tappable — there is nothing behind it yet, and a row that opens
    // nothing reads as broken.
    return (
      <View
        style={[
          styles.row,
          {
            minHeight: touch.listRow,
            gap: space[3],
            borderBottomColor: colors.borderSubtle,
            borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          },
        ]}
        accessibilityLabel={`${receipt.title}. ${receipt.pendingUntilLabel}`}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open ${receipt.title}`}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: touch.listRow,
          gap: space[3],
          borderBottomColor: colors.borderSubtle,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
        },
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  badge: { minWidth: 36, paddingHorizontal: 6, paddingVertical: 4, alignItems: 'center' },
  flex: { flex: 1 },
});
