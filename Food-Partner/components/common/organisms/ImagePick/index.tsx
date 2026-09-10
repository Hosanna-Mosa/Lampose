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
import { SAMPLE_JPEG, styles } from "@/components/common/utils/formStyles";
import { Field } from "@/components/common/molecules/Field";


/** The logo / cover-banner picker. Shows a real preview of what was chosen. */
export function ImagePick({
  label,
  desc,
  value,
  onChange,
  aspect = "square",
  allowSample = true,
}: {
  label: string;
  desc?: string;
  value: Attachment | null;
  onChange: (next: Attachment | null) => void;
  aspect?: "square" | "wide";
  /**
   * The "Sample" shortcut fills a stock photo in one tap — built for
   * onboarding, where the account is not live yet and dummy data is exactly
   * what a demo or a QA pass wants. A screen editing an ALREADY-APPROVED
   * restaurant's real public image must not offer it: a partner reaching for
   * "Choose" and tapping the wrong button next to it would put a stock photo
   * in front of real diners.
   */
  allowSample?: boolean;
}) {
  const pick = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.85,
        allowsEditing: true,
        aspect: aspect === "square" ? [1, 1] : [16, 9],
      });
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      onChange({ name: a.fileName || `${label}.jpg`, uri: a.uri, size: a.fileSize, mimeType: "image/jpeg" });
    } catch {
      /* Declining the picker is a normal outcome, not an error worth a banner. */
    }
  };

  /* Every attachment now carries something an <Image> can render: a picked
     file's local uri, a sample's data uri, or a Cloudinary link once it has
     been uploaded. */
  const showable = !!value?.uri;

  return (
    <Field label={label} hint={desc}>
      <View style={{ flexDirection: "row", gap: space[3], alignItems: "center" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose ${label}`}
          onPress={pick}
          style={[styles.imageTile, aspect === "wide" && { width: 132 }]}
        >
          {showable ? (
            <Image source={{ uri: value!.uri }} style={styles.imagePreview} resizeMode="cover" />
          ) : value ? (
            <Icon name="image" size={22} color={colors.brandInk} />
          ) : (
            <Icon name="camera" size={22} color={colors.textTertiary} />
          )}
        </Pressable>

        <View style={{ flex: 1, minWidth: 0, gap: space[2] }}>
          {value ? (
            <>
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {value.name}
              </Text>
              <View style={{ flexDirection: "row", gap: space[2] }}>
                <Pressable accessibilityRole="button" onPress={pick} style={styles.dropBtn}>
                  <Text variant="title3">Replace</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => onChange(null)} style={styles.dropBtn}>
                  <Text variant="title3" color="danger">
                    Remove
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={{ flexDirection: "row", gap: space[2] }}>
              <Pressable accessibilityRole="button" onPress={pick} style={styles.dropBtn}>
                <Icon name="image" size={14} color={colors.textPrimary} />
                <Text variant="title3">Choose</Text>
              </Pressable>
              {allowSample && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    onChange({ name: `${label}.jpg`, uri: SAMPLE_JPEG, mimeType: "image/jpeg", size: 160 })
                  }
                  style={styles.dropBtn}
                >
                  <Icon name="sparkle" size={14} color={colors.brandInk} />
                  <Text variant="title3" color="brand">
                    Sample
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
    </Field>
  );
}
