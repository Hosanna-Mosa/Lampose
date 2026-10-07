import React from "react";
import { Image, Pressable, View } from "react-native";

import { Icon } from "@/components/common/atoms/Icon";
import { Text } from "@/components/common/atoms/Text";
import { Field } from "@/components/common/molecules/Field";
import { styles } from "@/components/common/utils/formStyles";
import { usePhotoPicker } from "@/components/ui/PhotoPicker";
import type { Attachment } from "@/store/partnerStore";
import { colors, space } from "@/theme";

/**
 * The logo / cover-banner / dish picker. Shows a real preview of what was
 * chosen, and takes it from the camera or the gallery — never from a sample:
 * whatever is picked here is what diners are shown.
 */
export function ImagePick({
  label,
  desc,
  value,
  onChange,
  aspect = "square",
  allowRemove = true,
}: {
  label: string;
  desc?: string;
  value: Attachment | null;
  onChange: (next: Attachment | null) => void;
  aspect?: "square" | "wide";
  /**
   * Off where a photo can be replaced but not taken away — a live listing's
   * logo, which the server will not blank (it refuses an image with no url).
   */
  allowRemove?: boolean;
}) {
  const picker = usePhotoPicker();

  const pick = () =>
    picker.open({
      title: label,
      aspect: aspect === "square" ? [1, 1] : [16, 9],
      onPicked: ([photo]) => onChange(photo),
    });

  /* Every attachment carries something an <Image> can render: a picked file's
     local uri, or a Cloudinary link once it has been uploaded. */
  const showable = !!value?.uri;

  return (
    <Field label={label} hint={desc}>
      <View style={{ flexDirection: "row", gap: space[3], alignItems: "center" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={value ? `Replace ${label}` : `Add ${label}`}
          onPress={pick}
          style={[styles.imageTile, aspect === "wide" && { width: 132 }]}
        >
          {showable ? (
            <Image source={{ uri: value!.uri }} style={styles.imagePreview} resizeMode="cover" />
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
                {allowRemove ? (
                  <Pressable accessibilityRole="button" onPress={() => onChange(null)} style={styles.dropBtn}>
                    <Text variant="title3" color="danger">
                      Remove
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : (
            <Pressable accessibilityRole="button" onPress={pick} style={[styles.dropBtn, { alignSelf: "flex-start" }]}>
              <Icon name="camera" size={14} color={colors.textPrimary} />
              <Text variant="title3">Add photo</Text>
            </Pressable>
          )}
        </View>
      </View>
      {picker.sheet}
    </Field>
  );
}
