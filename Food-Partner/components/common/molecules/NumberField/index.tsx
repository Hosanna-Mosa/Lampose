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
import { TextField } from "@/components/common/molecules/TextField";


/** Digits (and one decimal point when allowed), with a unit either side. */
export function NumberField({
  value,
  onChangeText,
  placeholder,
  prefix,
  suffix,
  decimals,
  maxLength,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  decimals?: boolean;
  maxLength?: number;
}) {
  const clean = (raw: string) => {
    const stripped = decimals ? raw.replace(/[^0-9.]/g, "") : raw.replace(/\D/g, "");
    if (!decimals) return stripped;
    // Keep only the first decimal point; "12.3.4" is not a number.
    const [head, ...rest] = stripped.split(".");
    return rest.length ? `${head}.${rest.join("")}` : head;
  };

  return (
    <TextField
      value={value}
      onChangeText={(raw) => onChangeText(clean(raw))}
      placeholder={placeholder}
      keyboardType={decimals ? "decimal-pad" : "number-pad"}
      maxLength={maxLength}
      prefix={prefix}
      right={
        suffix ? (
          <Text variant="caption" color="tertiary">
            {suffix}
          </Text>
        ) : undefined
      }
    />
  );
}
