import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

/**
 * The full-screen gallery.
 *
 * Photos are grouped by what they show, so a student comparing two-sharing can
 * jump to the two-sharing photos instead of swiping through eighteen to find
 * them — and can check the bathroom without seeing a lobby shot first. The
 * counter is per group as well as overall, because "6 of 18" tells you where
 * you are in the set but not whether you have seen every bathroom.
 *
 * The provenance line is not decoration. Owner uploads go stale, and a student
 * deciding whether to trust a photo needs to know who took it and when.
 */

export type PhotoGroup = {
  id: string;
  /** "Two-sharing room", "Mess & kitchen", "Bathroom". */
  label: string;
  count: number;
  /**
   * The photographs themselves, in order.
   *
   * Optional, and where it is absent the tinted placeholders below are drawn
   * instead — which is what this gallery did for every group until listings
   * came from the database. The onboarding upload puts Cloudinary URLs on the
   * property document; nothing groups them by room yet, so a real listing
   * arrives as one group holding all of them.
   *
   * `count` stays the count. A group may know it has eighteen photographs and
   * have been handed four.
   */
  uris?: readonly string[];
};

export type PhotoGalleryProps = {
  visible: boolean;
  onClose: () => void;
  groups: readonly PhotoGroup[];
  /** "Uploaded by the owner, checked on our visit — 4 Aug". */
  provenance?: string;
  /** Which group to open on. */
  initialGroupId?: string;
};

const PLACEHOLDERS = [
  ['#6d7b8d', '#3a4553'],
  ['#7d8d7b', '#3f5340'],
  ['#8d7b8a', '#533f50'],
  ['#7b8a8d', '#3f5053'],
] as const;

export function PhotoGallery({
  visible,
  onClose,
  groups,
  provenance,
  initialGroupId,
}: PhotoGalleryProps) {
  const { colors, space, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [groupIndex, setGroupIndex] = useState(() => {
    const found = groups.findIndex((group) => group.id === initialGroupId);
    return found === -1 ? 0 : found;
  });
  const [pageIndex, setPageIndex] = useState(0);

  const group = groups[groupIndex];
  const total = groups.reduce((sum, item) => sum + item.count, 0);
  const seenBefore = groups.slice(0, groupIndex).reduce((sum, item) => sum + item.count, 0);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPageIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  if (!group) return null;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.graphite }}>
        <View style={[styles.bar, { paddingTop: insets.top, paddingHorizontal: space[2] }]}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close gallery"
            style={styles.close}
          >
            <Icon name="close" size={24} color={colors.onGraphite} />
          </Pressable>
          {/* Per group and overall — one tells you where you are in the set,
              the other whether you have seen everything of this kind. */}
          <Text variant="numMeta" style={{ color: colors.onGraphite }}>
            {pageIndex + 1} / {group.count} · {seenBefore + pageIndex + 1} of {total}
          </Text>
          <View style={styles.close} />
        </View>

        <ScrollView
          key={group.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={styles.flex}
        >
          {Array.from({ length: group.count }, (_, index) => {
            const [from, to] = PLACEHOLDERS[index % PLACEHOLDERS.length];
            const uri = group.uris?.[index];
            return (
              <View
                key={index}
                style={{ width, flex: 1, backgroundColor: from, alignItems: 'center', justifyContent: 'center' }}
              >
                {uri ? (
                  /* `contain`, not `cover`. This is the screen somebody opens
                     to judge a room before spending a deposit on it, and a
                     cropped photograph is the wrong trade at that moment —
                     letterboxing costs nothing here, where the ground is
                     already dark. */
                  <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
                ) : (
                  <>
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: to, opacity: 0.5 }]} />
                    <Text variant="numMeta" style={{ color: colors.onGraphiteMuted }}>
                      {group.label} · {index + 1}
                    </Text>
                  </>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View style={{ paddingBottom: insets.bottom + space[3], gap: space[3] }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space[4], gap: space[2] }}
          >
            {groups.map((item, index) => {
              const active = index === groupIndex;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setGroupIndex(index);
                    setPageIndex(0);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${item.label}, ${item.count} photos`}
                  style={{
                    minHeight: 40,
                    justifyContent: 'center',
                    paddingHorizontal: space[3],
                    borderRadius: radius.pill,
                    backgroundColor: active ? colors.onGraphite : colors.graphiteRaised,
                  }}
                >
                  <Text
                    variant={active ? 'bodyStrong' : 'body'}
                    style={{ color: active ? colors.graphite : colors.onGraphiteMuted }}
                  >
                    {item.label} · {item.count}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {provenance ? (
            <Text
              variant="caption"
              style={{ color: colors.onGraphiteMuted, paddingHorizontal: space[4] }}
            >
              {provenance}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
