/* ══════════════════════════════════════════════════════════════════════════
   A row of photographs that can be added to and taken from.

   For lists of photos — a restaurant's own, a dish's extra angles. Each tile
   is the real picture (a local file until Save uploads it, a Cloudinary link
   after), with a cross to take it out; the dashed tile at the end adds more,
   from the camera or the gallery, up to `max`. The first photo is the one
   shown first to diners, and "Show first" moves any other there.
   ══════════════════════════════════════════════════════════════════════════ */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";

import type { Attachment } from "@/store/partnerStore";
import { font, line, ms, radius, size, ui } from "@/theme/ui";
import { usePhotoPicker } from "./PhotoPicker";
import { Txt } from "./Txt";

const TILE = ms(98);

export function PhotoGrid({
  title,
  photos,
  onChange,
  max,
}: {
  /** The picker sheet's title — "Restaurant photos". */
  title: string;
  photos: Attachment[];
  onChange: (next: Attachment[]) => void;
  max: number;
}) {
  const picker = usePhotoPicker();
  const room = max - photos.length;

  const add = () =>
    picker.open({
      title,
      limit: room,
      onPicked: (picked) => onChange([...photos, ...picked].slice(0, max)),
    });

  const remove = (index: number) => onChange(photos.filter((_, i) => i !== index));
  const toFront = (index: number) => onChange([photos[index], ...photos.filter((_, i) => i !== index)]);

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {photos.map((photo, index) => (
          <View key={`${photo.uri}-${index}`} style={styles.tile}>
            <Image source={{ uri: photo.uri }} style={styles.image} resizeMode="cover" />
            <TouchableOpacity
              onPress={() => remove(index)}
              hitSlop={8}
              style={styles.remove}
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${index + 1}`}
            >
              <Ionicons name="close" size={14} color={ui.white} />
            </TouchableOpacity>
            {index === 0 ? (
              <View style={styles.firstTag}>
                <Txt style={styles.tagText}>Shown first</Txt>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => toFront(index)}
                style={styles.frontBtn}
                accessibilityRole="button"
                accessibilityLabel={`Show photo ${index + 1} first`}
              >
                <Txt style={styles.tagText}>Show first</Txt>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {room > 0 ? (
          <TouchableOpacity
            onPress={add}
            style={[styles.tile, styles.addTile]}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Add ${title.toLowerCase()}`}
          >
            <Ionicons name="camera-outline" size={ms(24)} color={ui.brandInk} />
            <Txt style={styles.addText}>Add photos</Txt>
          </TouchableOpacity>
        ) : null}
      </View>
      <Txt style={styles.count}>
        {photos.length} of {max}
        {room === 0 ? " · remove one to add another" : ""}
      </Txt>
      {picker.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: ui.sunken,
  },
  image: { width: "100%", height: "100%" },
  remove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  firstTag: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 3,
    backgroundColor: ui.brand,
    alignItems: "center",
  },
  frontBtn: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
  },
  tagText: { fontFamily: font.body.semibold, fontSize: size.small, lineHeight: line.small, color: ui.white },
  addTile: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: ui.brand,
    backgroundColor: ui.brandSkin,
  },
  addText: { fontFamily: font.body.semibold, fontSize: size.small, lineHeight: line.small, color: ui.brandInk },
  count: { fontFamily: font.body.medium, fontSize: size.small, lineHeight: line.small, color: ui.sec },
});
