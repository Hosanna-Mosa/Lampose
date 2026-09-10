import type { IconName } from "@/components/common/atoms/Icon";
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


/** tone: ok | bad | info | warn — mapped onto the theme's semantic set. */
export function Note({
  tone = "info",
  glyph,
  children,
}: {
  tone?: "ok" | "bad" | "info" | "warn";
  glyph?: IconName;
  children: React.ReactNode;
}) {
  const name = tone === "ok" ? "success" : tone === "bad" ? "danger" : tone === "warn" ? "warning" : "info";
  const t = resolveTone(name);
  const fallback: IconName = tone === "ok" ? "check" : tone === "info" ? "info" : "alert";

  return (
    <View style={[styles.note, { backgroundColor: t.tint, borderColor: t.border }]}>
      <Icon name={glyph ?? fallback} size={15} color={t.ink} />
      <Text variant="caption" style={{ color: t.ink, flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

// ─── Text inputs ──────────────────────────────────────────────────────────────

/**
 * A token-styled TextInput.
 *
 * This is the ONE sanctioned place a size is set outside the theme: React
 * Native's TextInput cannot render a <Text> child, so it has to carry the type
 * itself. It reads the `body` variant through `typeStyle` rather than naming a
 * number, which keeps it on the scale.
 */
