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
import { useBookings, useCreateSupportRequest } from '@/services';
import type { TicketCategoryId } from '@/types/support';

/** The categories that name a PROPERTY vs. the ones that never can. Splits
    the six the backend already offers rather than adding new ones — see
    `support.audiences.js`. */
const PROPERTY_CATEGORIES: readonly TicketCategoryId[] = ['property', 'deposit', 'owner', 'booking'];
const PLATFORM_CATEGORIES: readonly TicketCategoryId[] = ['payment', 'other'];

type Topic = 'platform' | 'property';

/**
 * Screen 60 — a new ticket.
 *
 * **"About the platform, or about a property?" comes first, before any
 * category.** That one answer decides who else ever reads this thread: pick
 * a property and the OWNER is added to it (in the Stay Partner app, wired
 * through `linkedPartnerId` — see `resolveLinkedPartner` on the backend);
 * pick the platform and this stays between the student and Lampose support,
 * whatever the words underneath end up being. Asking it as its own question
 * rather than inferring it from the category is what makes that promise
 * legible on screen instead of a rule buried in which chip happens to be
 * selected.
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

  const [topic, setTopic] = useState<Topic | null>(null);
  const [categoryId, setCategoryId] = useState<TicketCategoryId | null>(null);
  const [body, setBody] = useState('');
  /* Which place this is about, in the student's own words — the PLATFORM
     branch's fallback, where there is no real listing to attach (see
     `listingId` below). Free text rather than a picker for the same reason
     it always was: "a payment" is about nothing in the catalogue. */
  const [place, setPlace] = useState('');
  /* The PROPERTY branch's actual answer — a real listing, chosen from a
     booking or stay request this student genuinely has, which is what lets
     the backend resolve a real owner rather than trusting a typed name. */
  const [listingId, setListingId] = useState<string | null>(null);
  const [listingLabel, setListingLabel] = useState<string | null>(null);

  const { submitTicket, isSubmittingTicket, ticketError } = useCreateSupportRequest();

  /* Only fetched once "About a property" is chosen — no reason to ask for
     this student's bookings before they have said this is what the ticket
     needs. */
  const { bookings } = useBookings(topic === 'property');
  const properties = Array.from(
    new Map(bookings.map((b) => [b.propertyId, b.propertyName])).entries(),
  );

  const categories = ticketCategories.filter((c) => (
    topic === 'property' ? PROPERTY_CATEGORIES.includes(c.id) : PLATFORM_CATEGORIES.includes(c.id)
  ));

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
      const created = await submitTicket({
        category: categoryId,
        body: body.trim(),
        /* A real listing on the property branch — this is what lets the
           backend resolve a real owner and add them to the thread. A typed
           name on the platform branch, which is never enough to do that and
           is not meant to be: "a payment" is about nothing in the catalogue.
           An empty box sends nothing rather than an empty string, so the
           record says "not given" instead of "given as blank". */
        listingId: topic === 'property' ? listingId : null,
        placeLabel: topic === 'property' ? listingLabel : (place.trim() || null),
      });
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
        {/*
          The one question that decides who else ever reads this — see the
          header. Answered once; changing it after starting to type clears
          the category and the place so a "property" ticket never keeps a
          stale platform-only category (or the reverse) underneath it.
        */}
        <View style={{ gap: space[2] }}>
          <Text variant="label" color="secondary">
            What's this about?
          </Text>
          {(
            [
              { id: 'property' as const, label: 'A property', hint: 'A place you stayed at, or asked to. The owner will see this too.' },
              { id: 'platform' as const, label: 'The Lampose app', hint: 'A payment, or anything else about the app itself.' },
            ]
          ).map((option) => {
            const active = option.id === topic;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  if (option.id === topic) return;
                  setTopic(option.id);
                  setCategoryId(null);
                  setListingId(null);
                  setListingLabel(null);
                  setPlace('');
                }}
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
                  <Text variant="bodyStrong">{option.label}</Text>
                  <Text variant="caption" color="secondary">
                    {option.hint}
                  </Text>
                </View>
                {active ? <Icon name="check" size={20} color={colors.brandInk} /> : null}
              </Pressable>
            );
          })}
        </View>

        {topic === 'property' && properties.length === 0 ? (
          <Text variant="caption" color="tertiary">
            You have not stayed at or requested a property yet, so there is nothing to link this to —
            it will still reach Lampose support.
          </Text>
        ) : null}

        {topic === 'property' && properties.length > 0 ? (
          <View style={{ gap: space[2] }}>
            <Text variant="label" color="secondary">
              Which property?
            </Text>
            {properties.map(([id, name]) => {
              const active = id === listingId;
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    setListingId(active ? null : id);
                    setListingLabel(active ? null : name);
                  }}
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
                  <Text variant="bodyStrong" style={styles.flex}>
                    {name}
                  </Text>
                  {active ? <Icon name="check" size={20} color={colors.brandInk} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {topic ? (
        <View style={{ gap: space[2] }}>
          {categories.map((category) => {
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
        ) : null}

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
            {/* The platform branch's fallback — the property branch already
                named a real listing above, which is what the backend can
                actually route on. Asked after what happened, never before
                it: the first question on a support form should be the one
                somebody came to answer. */}
            {topic === 'platform' ? (
              <TextField
                label="Which place is this about?"
                value={place}
                onChangeText={setPlace}
                placeholder="The PG, hostel or kitchen, as it is named in the app"
                optional
                maxLength={120}
              />
            ) : null}
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
