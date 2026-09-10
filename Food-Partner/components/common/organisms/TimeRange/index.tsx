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
import { styles, toDate, toHHMM } from "@/components/common/utils/formStyles";


/**
 * Two time buttons and the OS picker behind them.
 *
 * Android's picker is a one-shot dialog that must be UNMOUNTED once it fires,
 * and it reports a cancel as `event.type === "dismissed"` rather than by
 * returning nothing. iOS renders inline. Both are handled here so no screen
 * has to think about it.
 */
export function TimeRange({
  slot,
  onChange,
  onRemove,
}: {
  slot: Slot;
  onChange: (next: Slot) => void;
  onRemove?: () => void;
}) {
  const [editing, setEditing] = useState<"open" | "close" | null>(null);

  const onPicked = (event: DateTimePickerEvent, picked?: Date) => {
    const which = editing;
    setEditing(null);
    if (event.type === "dismissed" || !picked || !which) return;
    onChange({ ...slot, [which]: toHHMM(picked) });
  };

  return (
    <View style={styles.timeRow}>
      <Pressable accessibilityRole="button" onPress={() => setEditing("open")} style={styles.timeBtn}>
        <Text variant="numMeta" color="tertiary">
          Opens
        </Text>
        <Text variant="priceMd">{slot.open}</Text>
      </Pressable>

      <Text variant="body" color="tertiary">
        —
      </Text>

      <Pressable accessibilityRole="button" onPress={() => setEditing("close")} style={styles.timeBtn}>
        <Text variant="numMeta" color="tertiary">
          Closes
        </Text>
        <Text variant="priceMd">{slot.close}</Text>
      </Pressable>

      {onRemove ? <IconBtn glyph="trash" accessibilityLabel="Remove this slot" onPress={onRemove} /> : null}

      {editing !== null && (
        <DateTimePicker
          value={toDate(editing === "open" ? slot.open : slot.close)}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onPicked}
        />
      )}
    </View>
  );
}
