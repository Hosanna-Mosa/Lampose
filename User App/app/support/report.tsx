import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Icon, Text, TextField } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  REPORT_DETAIL_HINT,
  REPORT_EMERGENCY_NOTE,
  REPORT_MIN_CHARS,
  REPORT_WEIGHT_NOTE,
  reportReasons,
} from '@/data/support';
import { useTheme } from '@/context/ThemeContext';

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
  const router = useRouter();

  const [reasonId, setReasonId] = useState<string | null>(null);
  const [detail, setDetail] = useState('');

  const reason = reportReasons.find((item) => item.id === reasonId);
  const short = detail.trim().length < REPORT_MIN_CHARS;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Report a serious problem"
        actionIcon="close"
        onAction={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[5], paddingBottom: space[8] }}
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

        <View style={{ gap: space[2] }}>
          <Button
            label="Send to the safety team"
            variant="destructive"
            fullWidth
            disabled={!reasonId || short}
            onPress={() => router.replace('/support')}
          />
          <Text variant="caption" color="tertiary" style={styles.centred}>
            Someone reads every report. You will hear from us either way, even if we decide there is
            nothing we can do.
          </Text>
        </View>
      </ScrollView>
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
