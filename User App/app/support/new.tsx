import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Icon, Text, TextField } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { SUPPORT_HOURS_NOTE, ticketCategories } from '@/data/support';
import { useTheme } from '@/context/ThemeContext';
import type { TicketCategoryId } from '@/types/support';

/**
 * Screen 60 — a new ticket.
 *
 * **The escalation to a report is offered here, not hidden behind it.** A
 * student being threatened over their deposit does not know that "report" is a
 * different queue with a different team and different powers — they know they
 * have a problem and they tap the support button. If the only route to the
 * safety team is a menu item they never find, the safety team hears nothing.
 *
 * So the door sits at the bottom of this screen, described by what is
 * happening to them rather than by our internal routing. It is deliberately
 * not styled as an alarm: making it loud would push ordinary complaints into
 * the safety queue and drown the real ones.
 */
export default function NewTicket() {
  const { colors, space, layout, mode, radius, touch } = useTheme();
  const router = useRouter();

  const [categoryId, setCategoryId] = useState<TicketCategoryId | null>(null);
  const [body, setBody] = useState('');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="What's wrong?"
        actionIcon="close"
        onAction={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[5], paddingBottom: space[8] }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: space[2] }}>
          {ticketCategories.map((category) => {
            const active = category.id === categoryId;
            return (
              <Pressable
                key={category.id}
                onPress={() => setCategoryId(category.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.option,
                  {
                    minHeight: touch.min,
                    borderRadius: radius.button,
                    padding: space[3],
                    gap: space[3],
                    backgroundColor: active ? colors.surfaceSunken : colors.surface,
                    borderColor: active ? colors.brand : colors.border,
                    borderWidth: active ? 1.5 : StyleSheet.hairlineWidth,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{category.label}</Text>
                  {/* What it covers, so the right queue is picked first time. */}
                  <Text variant="caption" color="secondary">
                    {category.hint}
                  </Text>
                </View>
                {active ? <Icon name="check" size={20} color={colors.brandInk} /> : null}
              </Pressable>
            );
          })}
        </View>

        {categoryId ? (
          <View style={{ gap: space[2] }}>
            <TextField
              label="What happened?"
              value={body}
              onChangeText={setBody}
              placeholder="When it started, what you have already tried, and who you told."
              multiline
            />
            <Text variant="caption" color="tertiary">
              Dates and amounts help us get it fixed in one reply instead of three.
            </Text>
          </View>
        ) : null}

        <View style={{ gap: space[2] }}>
          <Button
            label="Send to support"
            fullWidth
            disabled={!categoryId || body.trim().length === 0}
            onPress={() => router.replace('/support')}
          />
          <Text variant="caption" color="tertiary" style={styles.centred}>
            {SUPPORT_HOURS_NOTE}
          </Text>
        </View>

        {/* The door to the heavier path. Findable, not loud. */}
        <View
          style={{
            borderTopColor: colors.borderSubtle,
            borderTopWidth: StyleSheet.hairlineWidth,
            paddingTop: space[5],
            gap: space[2],
          }}
        >
          <Text variant="bodyStrong">Is someone threatening you, or keeping your money?</Text>
          <Text variant="caption" color="secondary">
            That is heavier than a support ticket and goes to a different team.
          </Text>
          <Button
            label="Report a serious problem"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/support/report')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  centred: { textAlign: 'center' },
  flex: { flex: 1 },
});
