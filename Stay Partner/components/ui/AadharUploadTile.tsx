import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { FieldLabel } from './Field';
import { Icon } from './Icon';
import { Text } from './Text';
import { ApiError } from '@/services/api/client';
import { uploadKycImages, type KycImage } from '@/services/api/addCustomer.api';
import { radius } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

/**
 * Identity photographs — picked, uploaded to Cloudinary, and reported back as
 * secure URLs.
 *
 * This used to be a toggle. `uploaded` was a boolean the owner flipped by
 * tapping a dashed box, nothing was picked and nothing was stored, and the
 * saved record simply asserted `aadharUploaded: true`. The tile now does the
 * whole job: pick, upload, show what came back, and let one be removed.
 *
 * ## Uploading happens here, not on save
 *
 * A three-image upload over a phone connection takes seconds. Doing it inside
 * the save button would stall the form at the moment the owner expects it to
 * finish, with a guest standing there. Doing it on pick means the wait happens
 * while they are still typing, and by the time they press Save the URLs are
 * already in hand.
 *
 * The consequence is an orphaned Cloudinary image whenever a form is
 * abandoned. That is the right side to err on — the alternative loses a
 * document somebody has already photographed.
 */
export function AadharUploadTile({
  images,
  onChange,
  /**
   * One photograph, and one is enough.
   *
   * This allowed five, which turned a single-field step into a gallery an
   * owner had to decide when they were finished with — and the server needs
   * exactly one legible picture of the card. The prop stays so a caller that
   * genuinely needs more can ask, but nothing does, and the SERVER caps it at
   * one regardless.
   */
  max = 1,
}: {
  images: KycImage[];
  onChange: (next: KycImage[]) => void;
  max?: number;
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = max - images.length;

  const pick = async () => {
    if (busy || remaining <= 0) return;
    setError(null);

    /* Asked at the moment of use rather than on mount. A permission dialog
       that appears while somebody is reading a form is a dialog they dismiss. */
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access is needed to attach the card.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      /* One image means no multi-select sheet to dismiss — the picker closes
         on the tap that chose the photograph. */
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
      /* Compressed on the device. A modern phone camera produces 4–8MB per
         frame, and a legible photograph of a card is a fraction of that —
         this is the difference between a two-second upload and a failed one
         on a hostel's wifi. */
      quality: 0.7,
    });

    if (picked.canceled || !picked.assets?.length) return;

    setBusy(true);
    try {
      const uploaded = await uploadKycImages(
        picked.assets.map((a) => ({
          uri: a.uri,
          name: a.fileName ?? undefined,
          mimeType: a.mimeType ?? undefined,
        })),
      );
      onChange([...images, ...uploaded].slice(0, max));
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'That upload did not go through.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (url: string) => onChange(images.filter((img) => img.url !== url));

  return (
    <View>
      <FieldLabel>Upload Aadhar</FieldLabel>

      {images.length ? (
        <View style={styles.grid}>
          {images.map((img) => (
            <View key={img.url} style={[styles.thumbWrap, { borderColor: c.borderCard }]}>
              <Image source={{ uri: img.url }} style={styles.thumb} resizeMode="cover" />
              <Pressable
                onPress={() => remove(img.url)}
                accessibilityRole="button"
                accessibilityLabel="Remove this photograph"
                hitSlop={8}
                style={[styles.remove, { backgroundColor: c.surface, borderColor: c.borderCard }]}
              >
                <Icon name="close" size={13} color={c.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {remaining > 0 ? (
        <Pressable
          onPress={pick}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Add a photograph of the Aadhar card"
          style={[
            styles.tile,
            images.length ? styles.tileCompact : null,
            busy
              ? { borderColor: c.borderCard, backgroundColor: c.surfaceSunken }
              : { borderColor: c.border, borderStyle: 'dashed' },
          ]}
        >
          <Icon name={busy ? 'clock' : 'image'} size={20} color={c.textTertiary} />
          <Text variant="badge" color="textTertiary">
            {busy ? 'Uploading…' : max > 1 && images.length ? `Add another · ${remaining} left` : 'Tap to upload'}
          </Text>
        </Pressable>
      ) : null}

      {error ? (
        <Text variant="badge" style={[styles.error, { color: c.error }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileCompact: { minHeight: 56, marginTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: {
    width: 84,
    height: 84,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { marginTop: 8 },
});
