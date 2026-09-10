/* ══════════════════════════════════════════════════════════════════════════
   Asking for help.

   One category, one message, and optionally the order it is about. There is no
   subject field: the server derives one from the first sentence of the body,
   and a form that asks for a title as well is a form where somebody writes
   their whole problem into the title.

   ## The categories are the server's list, not ours

   `GET /categories` says what this audience may file about, and posting
   anything else comes back as "Please choose what this is about." The words on
   the chips are this app's business — a kitchen says "settlement" where the
   rider's app says "payout" — but the ids are not.

   ## No safety report here

   Safety reports are the diner's alone; the same router answers a restaurant
   with 403 REPORTS_NOT_AVAILABLE. `reports` comes back false in the categories
   payload, so this screen knows without probing and never draws the entry
   point — the alternative is somebody typing two hundred careful characters
   and then being told the door does not exist.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Platform,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Field, KeyboardAware, Note, Refresher, Scroller, TextField } from "@/components/common";
import { Btn, Card, ChoiceChip, Text, TopBar } from "@/components/common";
import {
  BODY_MAX_FALLBACK,
  categoryWords,
  createTicket,
  fetchCategories,
} from "@/services/support";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, layout, space } from "@/theme";

export function NewSupportRequest() {
  const insets = useSafeAreaInsets();
  const session = usePartnerStore((s) => s.session);

  const [categories, setCategories] = useState<string[]>([]);
  const [bodyMax, setBodyMax] = useState(BODY_MAX_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");
  const [orderNumber, setOrderNumber] = useState("");

  const load = useCallback(async () => {
    /* A missing session must END the loading state, never skip past it — the
       same bug fixed in `(dash)/orders.tsx`. A form with no chips and no
       sentence looks like a form that is still thinking. */
    if (!session?.token) {
      setLoading(false);
      setError("You are signed out. Sign in again to send us a request.");
      return;
    }
    setError("");
    try {
      const audience = await fetchCategories(session.token);
      setCategories(audience.categories);
      setBodyMax(audience.bodyMax);
    } catch (err) {
      setError((err as Error)?.message || "We could not load the list of topics.");
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => {
    void load();
  }, [load]);

  const text = body.trim();
  const ready = !!session?.token && !!category && text.length > 0 && !sending;

  const send = async () => {
    if (!session?.token || !ready) return;
    setSending(true);
    setError("");
    try {
      const thread = await createTicket(session.token, {
        category,
        body: text,
        ...(orderNumber.trim() ? { orderNumber: orderNumber.trim() } : {}),
      });
      /* `replace`, not `push`: back from the thread belongs to the list, and a
         filled-in form somebody has already sent is not a place to return to. */
      router.replace(`/support/${thread.reference}`);
    } catch (err) {
      /* The server's own sentence — it is the one that says whether the
         category was refused, the message was too long, or ten requests have
         already gone in this hour. */
      setError((err as Error)?.message || "We could not send that. Try again in a moment.");
      setSending(false);
    }
  };

  const chosen = category ? categoryWords(category) : null;

  return (
    <Box style={styles.root}>
      <TopBar back="Help &amp; support" title="New request" />

      <KeyboardAware
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <Scroller
          contentContainerStyle={styles.body}
          refreshControl={
            <Refresher refreshing={loading} onRefresh={load} />
          }
          /* Without this the first tap on a chip only dismisses the keyboard,
             which reads as the control being broken. */
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!!error && <Note tone="bad">{error}</Note>}

          {loading && categories.length === 0 && !error && (
            <Text variant="body" color="tertiary">
              Loading the topics…
            </Text>
          )}

          {categories.length > 0 && (
            <>
              <Field
                label="What is this about?"
                required
                hint="Picking the closest one is what gets it to the right desk first time."
              >
                <Box style={styles.chips}>
                  {categories.map((id) => (
                    <ChoiceChip
                      key={id}
                      label={categoryWords(id).label}
                      selected={category === id}
                      onPress={() => setCategory(id)}
                    />
                  ))}
                </Box>
              </Field>

              {!!chosen?.hint && (
                <Card>
                  <Text variant="caption" color="secondary">
                    {chosen.hint}
                  </Text>
                </Card>
              )}

              <Field
                label="Order number"
                optional
                hint="If this is about one order, the number saves us asking."
              >
                <TextField
                  value={orderNumber}
                  onChangeText={(v) => setOrderNumber(v.toUpperCase().slice(0, 24))}
                  placeholder="e.g. LMP-2481"
                  autoCapitalize="characters"
                />
              </Field>

              <Field
                label="What happened?"
                required
                hint={`Dates, amounts and order numbers get this answered fastest. ${
                  body.length
                } of ${bodyMax} characters.`}
              >
                <TextField
                  value={body}
                  onChangeText={setBody}
                  placeholder="Tell us what happened, in your own words."
                  multiline
                  maxLength={bodyMax}
                  style={styles.bodyField}
                />
              </Field>

              <Note tone="info" glyph="clock">
                We answer in the app — the reply lands on this screen and the tablet shows it as a
                new reply. Nothing here changes an order.
              </Note>
            </>
          )}
        </Scroller>
      </KeyboardAware>

      {/* Pinned and clear of the device navigation bar. */}
      <Box style={[styles.actions, { paddingBottom: insets.bottom + space[3] }]}>
        <Btn
          label={sending ? "Sending…" : "Send to support"}
          glyph="mail"
          loading={sending}
          disabled={!ready}
          onPress={send}
        />
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: layout.gutter, gap: space[4], paddingBottom: space[6] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  bodyField: { minHeight: 160 },
  actions: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
