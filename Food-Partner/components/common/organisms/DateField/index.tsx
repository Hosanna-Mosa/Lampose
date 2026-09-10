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


export function DateField({
  value,
  onChange,
  placeholder = "Select a date",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const onPicked = (event: DateTimePickerEvent, picked?: Date) => {
    setOpen(false);
    if (event.type === "dismissed" || !picked) return;
    onChange(picked.toISOString().slice(0, 10));
  };

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.dateBtn}>
        <Icon name="calendar" size={16} color={colors.textSecondary} />
        <Text variant="body" color={value ? "primary" : "tertiary"} style={{ flex: 1 }}>
          {value || placeholder}
        </Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onPicked}
        />
      )}
    </>
  );
}

// ─── The step frame ───────────────────────────────────────────────────────────

/**
 * The frame all five steps render inside.
 *
 * The counter and its rail are PINNED, not scrolled. This is the one flow
 * where a partner fills long fields with the keyboard up, and "how much of
 * this is left" has to stay answerable without dismissing the keyboard and
 * scrolling back. The footer is pinned for the same reason.
 */
