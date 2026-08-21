import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, InlineAlert, Text, TextField } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import {
  REPORT_DETAIL_HINT,
  REPORT_EMERGENCY_NOTE,
  REPORT_MIN_CHARS,
  REPORT_WEIGHT_NOTE,
  reportReasons,
} from '@/data/support';
import { useTheme } from '@/context/ThemeContext';
import { useCreateSupportRequest } from '@/services';

/**
 * Screen 62 — reporting a serious problem.
 *
 * A report is not a ticket, and this screen exists to make that difference
 * felt before anything is typed.
 *
 * **The emergency line comes first — above everything.** A student in immediate
 * danger must not read a paragraph about our investigation process before being
 * told to call 100. Nothing on this screen is more urgent than that sentence,
 * so nothing is placed above it.
 *
 * **Then what a report actually does**, in three facts a student cannot infer:
 * it goes to a safety team rather than support; the owner is not told it exists
 * until we have looked; the listing may be suspended meanwhile. Someone
 * deciding whether to report an owner they still live with is weighing
 * retaliation, and they can only weigh it if they know when she finds out.
 *
 * **The minimum length is justified where it is enforced.** "Minimum 50
 * characters" reads as a form obstacle; "this may be used in a dispute" is why
 * the detail is worth typing, and it is the same sentence that makes someone
 * include the date and the exact words.
 */
export default function ReportProblem() {
  const { colors, space, layout, mode, radius, touch } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [reasonId, setReasonId] = useState<string | null>(null);
  const [detail, setDetail] = useState('');

  const reason = reportReasons.find((item) => item.id === reasonId);
  const short = detail.trim().length < REPORT_MIN_CHARS;

  const { submitReport, isSubmittingReport, reportError } = useCreateSupportRequest();

  /**
   * Files it, then opens the thread.
   *
   * The thread already contains a system line stating what a report does —
   * that it went to the safety team, that the owner is not told until we have
   * looked, that somebody reads every one. Landing there rather than back on
   * the list is what makes those promises re-readable at 2am by somebody who
   * is now worrying about having filed it. On the form they have just left,
   * they are not.
   *
   * A failure keeps every word on screen. This is the one form in the app
   * where losing the text would be worst: it is 50+ characters typed by
   * somebody upset, about dates and amounts they had to remember, and asking
   * them to type it twice is how a report stops being filed at all.
   */
  const send = async () => {
    if (!reasonId || short) return;
    try {
      const created = await submitReport({ reason: reasonId, body: detail.trim() });
      router.replace(`/support/${created.reference}` as never);
    } catch {
      /* Held in `reportError`, rendered beside the button. */
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
        title="Report a serious problem"
        actionIcon="close"
        onAction={() => router.back()}
      />

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{ padding: layout.gutter, gap: space[5] }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Nothing is placed above this. */}
        <View
          style={[
            styles.notice,
            {
              backgroundColor: colors.danger.tint,
              borderColor: colors.danger.base,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[3],
            },
          ]}
        >
          <Icon name="alert" size={20} color={colors.danger.base} />
          <Text variant="bodyStrong" style={{ color: colors.danger.ink, flex: 1 }}>
            {REPORT_EMERGENCY_NOTE}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.card,
            padding: space[4],
            gap: space[2],
          }}
        >
          <Text variant="title3">This is heavier than a support ticket</Text>
          <Text variant="body" color="secondary">
            {REPORT_WEIGHT_NOTE}
          </Text>
        </View>

        <View style={{ gap: space[3] }}>
          <Text variant="title3">What is happening?</Text>
          <View style={{ gap: space[2] }}>
            {reportReasons.map((item) => {
              const active = item.id === reasonId;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setReasonId(item.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      minHeight: touch.min,
                      borderRadius: radius.button,
                      paddingHorizontal: space[3],
                      gap: space[3],
                      backgroundColor: active ? colors.danger.tint : colors.surface,
                      borderColor: active ? colors.danger.base : colors.border,
                      borderWidth: active ? 1.5 : StyleSheet.hairlineWidth,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.radio,
                      {
                        borderRadius: radius.pill,
                        borderColor: active ? colors.danger.base : colors.border,
                      },
                    ]}
                  >
                    {active ? (
                      <View
                        style={[
                          styles.radioFill,
                          { borderRadius: radius.pill, backgroundColor: colors.danger.base },
                        ]}
                      />
                    ) : null}
                  </View>
                  <Text
                    variant="body"
                    style={[styles.flex, active ? { color: colors.danger.ink } : {}]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: space[2] }}>
          <TextField
            label="Tell us everything"
            value={detail}
            onChangeText={setDetail}
            placeholder="What was said, when, and by whom. Include amounts."
            multiline
            helper={REPORT_DETAIL_HINT}
          />
          {/* The count is shown, but the reason for it is the line above. */}
          <Text variant="numMeta" color={short ? 'tertiary' : 'secondary'}>
            {detail.trim().length} characters · {REPORT_MIN_CHARS} needed
          </Text>
        </View>

        {reason?.evidenceRequired ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[2],
            }}
          >
            <Text variant="bodyStrong">Anything you can show us</Text>
            <Text variant="caption" color="secondary">
              Screenshots of messages, photos of the room, a receipt. We cannot act on this reason
              without something to look at — and a WhatsApp screenshot is usually enough.
            </Text>
            <Button label="Add photos or screenshots" variant="secondary" fullWidth />
          </View>
        ) : null}

        {/* A failed report must never look like a sent one. There is no
            optimistic state on this screen and no navigation until the server
            has the record — somebody who believes the safety team was told,
            when it was not, is the worst outcome this app can produce. */}
        {reportError ? (
          <InlineAlert
            tone="error"
            title="Not sent"
            body={reportError.displayMessage}
            actionLabel="Try again"
            onAction={send}
          />
        ) : null}

        <View style={{ gap: space[2] }}>
          <Button
            label="Send to the safety team"
            loadingLabel="Sending"
            loading={isSubmittingReport}
            variant="destructive"
            fullWidth
            disabled={!reasonId || short || isSubmittingReport}
            onPress={send}
          />
          <Text variant="caption" color="tertiary" style={styles.centred}>
            Someone reads every report. You will hear from us either way, even if we decide there is
            nothing we can do.
          </Text>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1.5 },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  radio: { width: 20, height: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioFill: { width: 10, height: 10 },
  centred: { textAlign: 'center' },
  flex: { flex: 1 },
});
