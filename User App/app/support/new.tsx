import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, InlineAlert, Text, TextField } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { SUPPORT_HOURS_NOTE, ticketCategories } from '@/data/support';
import { useTheme } from '@/context/ThemeContext';
import { useCreateSupportRequest } from '@/services';
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
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [categoryId, setCategoryId] = useState<TicketCategoryId | null>(null);
  const [body, setBody] = useState('');

  const { submitTicket, isSubmittingTicket, ticketError } = useCreateSupportRequest();

  /**
   * Sends, then opens the thread it created.
   *
   * Landing on the new ticket rather than back on the list is the difference
   * between "something was submitted" and "here is your ticket, with its
   * reference, and what you wrote in it". The reference is the first thing
   * support asks for, and this is the only moment the student is guaranteed
   * to see it.
   *
   * `replace` rather than `push`, so Back from the thread goes to the list.
   * Leaving this form on the stack would let somebody back into a filled-in
   * copy of a ticket they have already sent and send it again.
   *
   * A failure keeps them here with everything they typed still in the box.
   * The alert below says what happened; the throw is swallowed because the
   * mutation has already recorded it.
   */
  const send = async () => {
    if (!categoryId || body.trim().length === 0) return;
    try {
      const created = await submitTicket({ category: categoryId, body: body.trim() });
      router.replace(`/support/${created.reference}` as never);
    } catch {
      /* Held in `ticketError`, rendered below. */
    }
  };

  return (
    /*
     * The bottom safe-area band is owned by the SCREEN ROOT, matching every
     * other screen in the app.
     *
     * It sat in the scroll content until now — first as `contentContainerStyle`
     * padding, then as a spacer `<View>` once it turned out a keyboard-aware
     * scroller manages its own content-container inset and can overwrite that
     * padding. Both only ever guaranteed the LAST element cleared the
     * navigation bar; the viewport still ran underneath it, so mid-scroll the
     * form visibly slid under the gesture bar.
     *
     * On the root it ends the viewport above the bar instead. It also puts this
     * padding somewhere the keyboard-aware scroller cannot reach at all — it is
     * a property of the parent View, not of the scroll content — which is what
     * the spacer was working around.
     */
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="What's wrong?"
        actionIcon="close"
        onAction={() => router.back()}
      />

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{ padding: layout.gutter, gap: space[5] }}
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

        {/* Nothing is optimistic here. A ticket that appears to send and
            silently rolls back on a dead connection is the failure that
            matters most on this screen — somebody believes they told us, and
            nobody has it. So the button waits for the server. */}
        {ticketError ? (
          <InlineAlert
            tone="error"
            title="Not sent"
            body={ticketError.displayMessage}
            actionLabel="Try again"
            onAction={send}
          />
        ) : null}

        <View style={{ gap: space[2] }}>
          <Button
            label="Send to support"
            loadingLabel="Sending"
            loading={isSubmittingTicket}
            fullWidth
            disabled={!categoryId || body.trim().length === 0 || isSubmittingTicket}
            onPress={send}
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
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  centred: { textAlign: 'center' },
  flex: { flex: 1 },
});
