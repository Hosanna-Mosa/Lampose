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
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import {
  Button,
  Card,
  Chip,
  Field,
  Header,
  InfoNote,
  ScreenShell,
  TextField,
  fadeInUp,
} from "@/components/ui";
import {
  BODY_MAX_FALLBACK,
  categoryWords,
  createTicket,
  fetchCategories,
} from "@/services/support";
import { usePartnerStore } from "@/store/partnerStore";
import { ui } from "@/theme/ui";

export function NewSupportRequest() {
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
    <ScreenShell
      keyboardAvoiding
      header={<Header title="New request" onBack={() => router.back()} backLabel="Back to Help & support" />}
      scroll
      refreshing={loading}
      onRefresh={load}
      contentStyle={styles.body}
      /* Pinned and clear of the device navigation bar. */
      footer={
        <Button
          title={sending ? "Sending…" : "Send to support"}
          icon={<Ionicons name="mail-outline" size={20} color={ui.onBrand} />}
          loading={sending}
          disabled={!ready}
          fullWidth
          onPress={send}
        />
      }
    >
      {!!error && <InfoNote tone="danger" text={error} />}

      {/* The topics did not load, so there is no form to show — and a
          pull-to-refresh nobody knows about was the only way back. */}
      {!!error && !loading && categories.length === 0 && !!session?.token && (
        <Button
          title="Try again"
          variant="secondary"
          fullWidth
          icon={<Ionicons name="refresh" size={18} color={ui.text} />}
          onPress={() => {
            setLoading(true);
            void load();
          }}
        />
      )}

      {loading && categories.length === 0 && !error && (
        <ActivityIndicator size="large" color={ui.brand} style={styles.loader} accessibilityLabel="Loading the topics…" />
      )}

      {categories.length > 0 && (
        <Animated.View entering={fadeInUp(0)} style={styles.stack}>
          <Card bordered elevationLevel="none" style={styles.form}>
            <Field
              label="What is this about?"
              required
              hint="Picking the closest one is what gets it to the right desk first time."
            >
              <View style={styles.chips}>
                {categories.map((id) => (
                  <Chip
                    key={id}
                    label={categoryWords(id).label}
                    selected={category === id}
                    onPress={() => setCategory(id)}
                  />
                ))}
              </View>
            </Field>

            {!!chosen?.hint && <InfoNote tone="info" text={chosen.hint} />}

            <TextField
              label="Order number"
              optional
              hint="If this is about one order, the number saves us asking."
              value={orderNumber}
              onChangeText={(v) => setOrderNumber(v.toUpperCase().slice(0, 24))}
              placeholder="e.g. LO4K7Q2M"
              autoCapitalize="characters"
            />

            <TextField
              label="What happened?"
              required
              hint={`Dates, amounts and order numbers get this answered fastest. ${body.length} of ${bodyMax} characters.`}
              value={body}
              onChangeText={setBody}
              placeholder="Tell us what happened, in your own words."
              multiline
              multilineHeight={160}
              maxLength={bodyMax}
              autoCapitalize="sentences"
            />
          </Card>

          <InfoNote
            tone="info"
            icon="time-outline"
            text="We answer in the app — the reply lands on this screen and the tablet shows it as a new reply. Nothing here changes an order."
          />
        </Animated.View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 14 },
  loader: { marginTop: 40 },
  stack: { gap: 14 },
  form: { gap: 18 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
