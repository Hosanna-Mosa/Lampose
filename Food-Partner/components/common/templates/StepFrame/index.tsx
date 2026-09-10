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
import { StepScaffold } from "@/components/common/templates/StepScaffold";


/**
 * A step, wired up: the scaffold, the gate line, and the two footer buttons.
 *
 * Every step needs exactly this arrangement, and the gate line has to sit
 * directly above the disabled button it explains — so the two are assembled
 * here once rather than five times, where they could drift apart.
 */
export function StepFrame({
  step,
  intro,
  children,
  missing,
  onNext,
  onBack,
  onSample,
  nextLabel = "Next step",
  backLabel = "Back",
  gatePrefix = "Still to fill in: ",
  nextLoading,
}: {
  step: number;
  intro?: string;
  children: React.ReactNode;
  /** From `missingFor`. Empty means the step is done. */
  missing: string[];
  onNext: () => void;
  onBack: () => void;
  onSample?: () => void;
  nextLabel?: string;
  backLabel?: string;
  gatePrefix?: string;
  nextLoading?: boolean;
}) {
  return (
    <StepScaffold
      step={step}
      intro={intro}
      onSample={onSample}
      onExit={() => router.replace("/")}
      footer={
        <>
          <Btn label={backLabel} variant="ghost" onPress={onBack} style={{ flex: 1 }} />
          <Btn
            label={nextLabel}
            onPress={onNext}
            disabled={missing.length > 0}
            loading={nextLoading}
            style={{ flex: 1.4 }}
          />
        </>
      }
    >
      {children}
      {missing.length > 0 && <Notice tone="info" glyph="info" title={`${gatePrefix}${humanList(missing)}.`} />}
    </StepScaffold>
  );
}
