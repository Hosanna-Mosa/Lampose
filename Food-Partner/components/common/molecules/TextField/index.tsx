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


// ─── Text inputs ──────────────────────────────────────────────────────────────

/**
 * A token-styled TextInput.
 *
 * This is the ONE sanctioned place a size is set outside the theme: React
 * Native's TextInput cannot render a <Text> child, so it has to carry the type
 * itself. It reads the `body` variant through `typeStyle` rather than naming a
 * number, which keeps it on the scale.
 */
export function TextField({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = "sentences",
  secureTextEntry,
  maxLength,
  multiline,
  editable = true,
  state,
  prefix,
  right,
  style,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  secureTextEntry?: boolean;
  maxLength?: number;
  multiline?: boolean;
  editable?: boolean;
  state?: "ok" | "bad";
  prefix?: string;
  right?: React.ReactNode;
  style?: ViewStyle;
}) {
  const [focused, setFocused] = useState(false);

  const borderColor =
    state === "bad"
      ? colors.danger.base
      : state === "ok"
        ? colors.success.base
        : focused
          ? colors.brand
          : colors.borderInput;

  return (
    <View
      style={[
        styles.inputWrap,
        { borderColor, backgroundColor: editable ? colors.surface : colors.surfaceSunken },
        multiline && { minHeight: 88, alignItems: "flex-start", paddingVertical: space[2] },
        style,
      ]}
    >
      {!!prefix && (
        <Text variant="bodyStrong" color="secondary">
          {prefix}
        </Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        multiline={multiline}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, typeStyle("body"), { color: editable ? colors.textPrimary : colors.textSecondary }]}
      />
      {right}
    </View>
  );
}

/** Digits (and one decimal point when allowed), with a unit either side. */
