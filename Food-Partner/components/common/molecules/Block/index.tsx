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


/** A section inside a step: an icon tile, a title, and a card of fields. */
export function Block({
  glyph,
  title,
  subtitle,
  children,
}: {
  glyph: IconName;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <View style={styles.blockIco}>
          <Icon name={glyph} size={18} color={colors.brandInk} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title1">{title}</Text>
          {!!subtitle && (
            <Text variant="caption" color="tertiary">
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.blockCard}>{children}</View>
    </View>
  );
}

/** tone: ok | bad | info | warn — mapped onto the theme's semantic set. */
