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


// ─── Label / hint / control ───────────────────────────────────────────────────

export function Field({
  label,
  required,
  optional,
  hint,
  children,
}: {
  label?: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: space[2] }}>
      {!!label && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[1], flexWrap: "wrap" }}>
          <Text variant="label" color="secondary">
            {label}
          </Text>
          {required && (
            <Text variant="label" style={{ color: colors.danger.base }}>
              *
            </Text>
          )}
          {optional && (
            <Text variant="caption" color="tertiary">
              (optional)
            </Text>
          )}
        </View>
      )}
      {!!hint && (
        <Text variant="caption" color="tertiary">
          {hint}
        </Text>
      )}
      {children}
    </View>
  );
}

/** A section inside a step: an icon tile, a title, and a card of fields. */
