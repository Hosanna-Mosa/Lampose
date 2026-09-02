/* ══════════════════════════════════════════════════════════════════════════
   Raise something with support.

   ## The categories come from the SERVER

   `fetchCategories` asks `/api/v2/drivers/support/categories` rather than this
   screen holding a list. Three apps now file into one queue, each with its own
   set of categories, and a hardcoded copy here is a copy that drifts from the
   server's enum. When it drifts the failure is not an error anybody can act
   on: the rider picks "Payout", presses send, and is told "please choose what
   this is about" about the choice they just made.

   `CATEGORY_LABEL` supplies only the WORDS, and an id it has never seen falls
   back to the id itself rather than rendering an empty pill — so a category
   added on the server appears here immediately, unstyled but usable.

   ## The order number is optional, and it is the most useful field on the form

   Most of what a rider raises is about one delivery. Support reading a thread
   WITH the order open beside it is a different conversation from support
   reading a thread and asking which order — so the field is offered, prompted
   for, and never required, because a payout question spans a week and belongs
   to no single order.

   Which is why it is also a PARAMETER. The "Report a problem" sheet is opened
   from a job in hand and knows exactly which order the rider is standing on;
   arriving here with the field blank made the one screen that already had the
   answer ask a rider at a counter to read an order number off the screen
   behind this one and type it back in. It is seeded, never locked: a rider who
   meant a different delivery edits it like any other box.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Btn, ChoiceField, Input, Notice, Text, TopBar } from "@/components/ui";
import { useDriverStore } from "@/store/driverStore";
import { CATEGORY_LABEL, createTicket, fetchCategories } from "@/services/support";
import { colors, layout, space } from "@/theme";

const MIN_CHARS = 10;

export default function NewSupportRequestScreen() {
  const insets = useSafeAreaInsets();
  const token = useDriverStore((s) => s.token);
  const params = useLocalSearchParams<{ category?: string; orderNumber?: string }>();

  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(
    typeof params.category === "string" ? params.category : null,
  );
  const [body, setBody] = useState("");
  const seededOrder = typeof params.orderNumber === "string" ? params.orderNumber : "";
  const [orderNumber, setOrderNumber] = useState(seededOrder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void fetchCategories(token)
      .then((list) => {
        if (!alive) return;
        setCategories(list);
        /* A category arriving from a tile is trusted only as far as the
           server's own list. A stale deep link naming a category that no
           longer exists is CLEARED rather than kept: keeping it would draw a
           selected pill the picker cannot show, and the rider would press send
           on a choice the server then refuses. */
        setCategory((current) => (current && list.includes(current) ? current : null));
      })
      .catch(() => {
        /* Not fatal and not worth an error banner: the rider can still type,
           and the picker falls back to the ids the app knows. */
        if (alive) setCategories(Object.keys(CATEGORY_LABEL));
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const options = (categories.length ? categories : Object.keys(CATEGORY_LABEL)).map((id) => ({
    value: id,
    label: CATEGORY_LABEL[id]?.label ?? id,
  }));

  const hint = category ? CATEGORY_LABEL[category]?.hint : undefined;
  const text = body.trim();
  const canSend = !!token && !!category && text.length >= MIN_CHARS && !busy;

  const send = async () => {
    if (!canSend || !token || !category) return;
    setBusy(true);
    setError("");
    try {
      const ticket = await createTicket(token, {
        category,
        body: text,
        orderNumber: orderNumber.trim() || undefined,
      });
      /* `replace`, not `push`: going back from the thread should return to the
         list, not to a filled-in form that would file a second copy. */
      router.replace(`/ticket?reference=${ticket.reference}`);
    } catch (err) {
      /* The SERVER's sentence. It knows things this screen does not — that the
         rider has filed ten things this hour, that the category was refused. */
      setError((err as Error)?.message || "We could not send that.");
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TopBar back="Support" title="New request" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: space[6] }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!token && (
          <Notice
            tone="warning"
            title="You are signed out"
            body="Sign in again to raise a request."
          />
        )}

        {!!error && <Notice tone="danger" title="Not sent" body={error} />}

        <ChoiceField
          label="What is this about?"
          hint={hint}
          options={options}
          value={category}
          onChange={setCategory}
        />

        <Input
          label="What happened?"
          hint="Dates, amounts and order numbers are what let us fix it the first time."
          multiline
          numberOfLines={6}
          value={body}
          onChangeText={setBody}
          placeholder="Tell us what went wrong…"
        />

        <Input
          label="Order number"
          hint={
            seededOrder && orderNumber === seededOrder
              ? "The delivery you were on. Change it if you meant another one."
              : "If this is about one delivery. Leave it blank if not."
          }
          required={false}
          autoCapitalize="characters"
          mono
          value={orderNumber}
          onChangeText={setOrderNumber}
          placeholder="LO48102"
        />

        {/* Says WHY the button is dead rather than leaving a dead button. */}
        {!canSend && !busy && (
          <Text variant="caption" color="tertiary">
            {!category
              ? "Pick what this is about."
              : text.length < MIN_CHARS
                ? "Tell us a little more — a sentence is enough."
                : ""}
          </Text>
        )}
      </ScrollView>

      {/* Pinned, and it pays the whole safe-area clearance itself: the root
          here is a KeyboardAvoidingView, which sets its own height and applies
          no inset, so without this the button sits on the gesture bar. */}
      <View
        style={[
          styles.actions,
          { paddingBottom: Math.max(insets.bottom, 24) + space[2] },
        ]}
      >
        <Btn
          label={busy ? "Sending…" : "Send to support"}
          loading={busy}
          disabled={!canSend}
          onPress={() => void send()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, gap: space[3] },
  actions: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
