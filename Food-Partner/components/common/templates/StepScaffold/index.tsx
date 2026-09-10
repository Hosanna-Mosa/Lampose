import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Btn } from "@/components/common/atoms/Btn";
import { ChoiceChip } from "@/components/common/molecules/ChoiceChip";
import { Icon } from "@/components/common/atoms/Icon";
import { IconBtn } from "@/components/common/atoms/IconBtn";
import { Notice } from "@/components/common/molecules/Notice";
import { StepBars } from "@/components/common/molecules/StepBars";
import { Text } from "@/components/common/atoms/Text";
import { Toggle } from "@/components/common/atoms/Toggle";
import { TopBar } from "@/components/common/organisms/TopBar";
import { STEPS, TOTAL_STEPS } from "@/constants/partner";
import { humanList } from "@/lib/gates";
import type { Attachment, Slot } from "@/store/partnerStore";
import { colors, layout, radius, space, tone as resolveTone, touch, typeStyle } from "@/theme";
import { styles } from "@/components/common/utils/formStyles";


// ─── The step frame ───────────────────────────────────────────────────────────

/**
 * The frame all five steps render inside.
 *
 * The counter and its rail are PINNED, not scrolled. This is the one flow
 * where a partner fills long fields with the keyboard up, and "how much of
 * this is left" has to stay answerable without dismissing the keyboard and
 * scrolling back. The footer is pinned for the same reason.
 */
export function StepScaffold({
  step,
  intro,
  children,
  footer,
  onSample,
  onExit,
}: {
  step: number;
  intro?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** Fills this step with sample content. A testing affordance — see the store. */
  onSample?: () => void;
  onExit: () => void;
}) {
  const insets = useSafeAreaInsets();
  const spec = STEPS[step - 1];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        back="the previous step"
        title={`Step ${step} of ${TOTAL_STEPS}`}
        subtitle={spec?.label}
        action="Save & exit"
        onAction={onExit}
      />
      <View style={styles.rail}>
        <StepBars total={TOTAL_STEPS} current={step - 1} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          /* Without this the first tap on a chip only dismisses the keyboard,
             which reads as the control being broken. */
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!!intro && (
            <Text variant="bodyLg" color="secondary">
              {intro}
            </Text>
          )}

          {!!onSample && (
            <Pressable accessibilityRole="button" onPress={onSample} style={styles.sampleBtn}>
              <Icon name="sparkle" size={15} color={colors.brandInk} />
              <Text variant="title3" color="brand">
                Fill this step with sample data
              </Text>
            </Pressable>
          )}

          {children}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>{footer}</View>
    </View>
  );
}

/**
 * A step, wired up: the scaffold, the gate line, and the two footer buttons.
 *
 * Every step needs exactly this arrangement, and the gate line has to sit
 * directly above the disabled button it explains — so the two are assembled
 * here once rather than five times, where they could drift apart.
 */
