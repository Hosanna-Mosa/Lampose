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


export function SwitchRow({
  value,
  onChange,
  label,
  sub,
  glyph,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  sub?: string;
  glyph?: IconName;
}) {
  return (
    <View style={styles.switchRow}>
      {glyph ? <Icon name={glyph} size={18} color={colors.textSecondary} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {!!sub && (
          <Text variant="caption" color="tertiary">
            {sub}
          </Text>
        )}
      </View>
      <Toggle value={value} onChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

// ─── Files & images ───────────────────────────────────────────────────────────

/**
 * Sample attachments.
 *
 * Nothing is uploaded from this form yet — only the file's name travels with
 * the application — so these let the whole flow be walked end to end without
 * hunting for a scan of an FSSAI licence. The sheet sample is real CSV that
 * `readMenuSheet` parses, so the upload path can be tested too.
 */
