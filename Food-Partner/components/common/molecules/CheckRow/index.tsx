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


export function CheckRow({
  checked,
  onChange,
  label,
  sub,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  sub?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={styles.checkRow}
    >
      <View
        style={[
          styles.checkBox,
          checked
            ? { backgroundColor: colors.brand, borderColor: colors.brand }
            : { backgroundColor: colors.surface, borderColor: colors.borderInput },
        ]}
      >
        {checked ? <Icon name="check" size={13} color={colors.onBrand} strokeWidth={2.5} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {!!sub && (
          <Text variant="caption" color="tertiary">
            {sub}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
