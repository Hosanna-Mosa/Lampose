/* Shared helpers and the stylesheet, lifted verbatim out of components/form/index.tsx when it was
   split into one folder per component. Contents unchanged. */
import { iconBadge, inputLikeRow } from "@/components/common/utils/sharedStyles";
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


// ─── Files & images ───────────────────────────────────────────────────────────

/**
 * Sample attachments.
 *
 * Nothing is uploaded from this form yet — only the file's name travels with
 * the application — so these let the whole flow be walked end to end without
 * hunting for a scan of an FSSAI licence. The sheet sample is real CSV that
 * `readMenuSheet` parses, so the upload path can be tested too.
 */
export const SAMPLE_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";


export const SAMPLE_CSV =
  "category,itemName,price,description,type,isBestseller\n" +
  "Starters,Paneer Tikka,220,Char-grilled cottage cheese,Veg,yes\n" +
  "Main Course,Chicken Biryani,320,Dum-cooked with long grain rice,Non-Veg,yes\n";

/** Below 1 KB, `(size / 1024).toFixed(0)` rounds every small file — the CSV
 * sample among them, at ~160 bytes — down to a misleading "0 KB". */


/** Below 1 KB, `(size / 1024).toFixed(0)` rounds every small file — the CSV
 * sample among them, at ~160 bytes — down to a misleading "0 KB". */
export const formatFileSize = (size: number): string => (size < 1024 ? `${size} B` : `${(size / 1024).toFixed(0)} KB`);


export const sampleFor = (label: string, kind: PickKind): Attachment => {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (kind === "sheet") {
    /* URI-encoded rather than base64: `menu.tsx`'s reader decodes this with
       `decodeURIComponent`, a plain ECMAScript builtin that exists on Hermes
       and JSC alike. `btoa` does not — it is a Web API, and on a Hermes
       runtime with no polyfill `globalThis.btoa?.(...)` silently falls
       through to `""`, so the "sample" CSV would have been empty (there is
       your "0 KB") even before the read tried, and failed, to `fetch()` a
       data: URI at all — see the comment in `menu.tsx`. */
    return {
      name: `${slug}_sample.csv`,
      uri: `data:text/csv,${encodeURIComponent(SAMPLE_CSV)}`,
      mimeType: "text/csv",
      size: SAMPLE_CSV.length,
    };
  }
  /* Real image bytes, not a placeholder path: a sample has to survive the
     Cloudinary upload exactly as a real photograph does, or "use a sample"
     would test a route the product never takes. */
  return { name: `${slug}_sample.jpg`, uri: SAMPLE_JPEG, mimeType: "image/jpeg", size: 160 };
};


export type PickKind = "image" | "document" | "sheet";


// ─── Time & date ──────────────────────────────────────────────────────────────

export const toDate = (hhmm: string): Date => {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
};


export const toHHMM = (d: Date): string =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * Two time buttons and the OS picker behind them.
 *
 * Android's picker is a one-shot dialog that must be UNMOUNTED once it fires,
 * and it reports a cancel as `event.type === "dismissed"` rather than by
 * returning nothing. iOS renders inline. Both are handled here so no screen
 * has to think about it.
 */


// ─── Styles ───────────────────────────────────────────────────────────────────

export const styles = StyleSheet.create({
  blockIco: iconBadge,
  /* A flat section, not a card: no background, no border, no radius, and no
     horizontal padding of its own — the fields sit at the same left edge as
     the block's own title above them rather than indented into a box. A
     bottom divider is what tells one block's fields from the next block's
     title, the same move already made on the Menu, Profile and Status
     screens. Every step screen in the app gets this for free, since `Block`
     is the one component all five of them build their sections from. */
  blockCard: {
    gap: space[4],
    paddingBottom: space[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.chip,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: 1.5,
    borderRadius: radius.button,
    paddingHorizontal: space[3],
    minHeight: touch.min,
  },
  input: { flex: 1, paddingVertical: space[2], minHeight: touch.min - 4 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },

  checkRow: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: touch.min },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: radius.chip - 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: touch.min },

  fileSet: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    backgroundColor: colors.brandTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    borderRadius: radius.button,
    padding: space[3],
  },
  drop: {
    alignItems: "center",
    gap: space[2],
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[4],
  },
  dropIco: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  dropBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.button,
    paddingHorizontal: space[3],
    minHeight: touch.min - 6,
    justifyContent: "center",
  },

  imageTile: {
    width: 76,
    height: 76,
    borderRadius: radius.button,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  imagePreview: { width: "100%", height: "100%" },

  timeRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  timeBtn: {
    flex: 1,
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderInput,
    borderRadius: radius.button,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    minHeight: touch.min,
    justifyContent: "center",
  },
  dateBtn: inputLikeRow,

  rail: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[3],
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  body: { padding: layout.gutter, paddingBottom: space[8], gap: space[5] },
  sampleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    backgroundColor: colors.brandTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    borderRadius: radius.button,
    minHeight: touch.min,
  },
  footer: {
    flexDirection: "row",
    gap: space[2],
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
