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
import { PickKind, formatFileSize, sampleFor, styles } from "@/components/common/utils/formStyles";
import { Note } from "@/components/common/molecules/Note";


export function FilePick({
  label,
  desc,
  value,
  onChange,
  kind = "document",
}: {
  label: string;
  desc?: string;
  value: Attachment | null;
  onChange: (next: Attachment | null) => void;
  kind?: PickKind;
}) {
  const [error, setError] = useState("");

  const pick = async () => {
    setError("");
    try {
      if (kind === "image") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError("Photo access was declined. You can use a sample instead.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
        if (result.canceled || !result.assets?.length) return;
        const a = result.assets[0];
        onChange({
          name: a.fileName || `${label}.jpg`,
          uri: a.uri,
          size: a.fileSize,
          mimeType: a.mimeType || "image/jpeg",
        });
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: kind === "sheet" ? ["text/csv", "text/comma-separated-values", "*/*"] : ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      onChange({ name: a.name, uri: a.uri, size: a.size ?? undefined, mimeType: a.mimeType ?? undefined });
    } catch {
      // A picker that fails must not take the step down with it.
      setError("That did not work. Try again, or use a sample.");
    }
  };

  if (value) {
    return (
      <View style={styles.fileSet}>
        <Icon name={kind === "sheet" ? "sheet" : "doc"} size={20} color={colors.brandInk} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {value.name}
          </Text>
          {!!value.size && (
            <Text variant="numMeta" color="tertiary">
              {formatFileSize(value.size)}
            </Text>
          )}
        </View>
        <IconBtn glyph="close" accessibilityLabel={`Remove ${value.name}`} onPress={() => onChange(null)} />
      </View>
    );
  }

  return (
    <View style={styles.drop}>
      <View style={styles.dropIco}>
        <Icon name="upload" size={18} color={colors.brandInk} />
      </View>
      <Text variant="title3">{label}</Text>
      {!!desc && (
        <Text variant="caption" color="tertiary" style={{ textAlign: "center" }}>
          {desc}
        </Text>
      )}
      {!!error && <Note tone="bad">{error}</Note>}
      <View style={{ flexDirection: "row", gap: space[2], marginTop: space[1] }}>
        <Pressable accessibilityRole="button" onPress={pick} style={styles.dropBtn}>
          <Icon name="upload" size={14} color={colors.textPrimary} />
          <Text variant="title3">Choose a file</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(sampleFor(label, kind))}
          style={styles.dropBtn}
        >
          <Icon name="sparkle" size={14} color={colors.brandInk} />
          <Text variant="title3" color="brand">
            Use a sample
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The logo / cover-banner picker. Shows a real preview of what was chosen. */
