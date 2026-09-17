import { useState } from 'react';
import { Box, Picture, Tappable } from '@/components/common';
import * as ImagePicker from 'expo-image-picker';
import { Text, Icon, FieldError } from '@/components/common';
import { ApiError, uploadPropertyImages } from '@/services';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/settings-property-edit/styles';
import { MAX_PHOTOS } from '@/components/settings-property-edit/utils';

export function PropertyPhotosField({
  images,
  onChange,
}: {
  images: string[];
  onChange: (next: string[]) => void;
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = MAX_PHOTOS - images.length;

  const pick = async () => {
    if (busy || remaining <= 0) return;
    setError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access is needed to add pictures.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
      quality: 0.7,
    });

    if (picked.canceled || !picked.assets?.length) return;

    setBusy(true);
    try {
      const uploaded = await uploadPropertyImages(
        picked.assets.map((a) => ({ uri: a.uri, name: a.fileName ?? undefined, mimeType: a.mimeType ?? undefined })),
      );
      onChange([...images, ...uploaded.map((u) => u.url)].slice(0, MAX_PHOTOS));
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'That upload did not go through.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (url: string) => onChange(images.filter((u) => u !== url));

  return (
    <Box>
      {images.length ? (
        <Box style={styles.photoGrid}>
          {images.map((url, index) => (
            <Box key={`${url}-${index}`} style={[styles.photoThumbWrap, { borderColor: c.borderCard }]}>
              <Picture source={{ uri: url }} style={styles.photoThumb} resizeMode="cover" />
              {index === 0 ? (
                <Box style={[styles.coverBadge, { backgroundColor: c.accent }]}>
                  <Text variant="badge" color="white">
                    Cover
                  </Text>
                </Box>
              ) : null}
              <Tappable
                onPress={() => remove(url)}
                accessibilityRole="button"
                accessibilityLabel="Remove this photo"
                hitSlop={8}
                style={[styles.photoRemove, { backgroundColor: c.surface, borderColor: c.borderCard }]}
              >
                <Icon name="close" size={13} color={c.textSecondary} />
              </Tappable>
            </Box>
          ))}
        </Box>
      ) : null}

      {remaining > 0 ? (
        <Tappable
          onPress={pick}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Add property photos"
          style={[
            styles.photoTile,
            images.length ? styles.photoTileCompact : null,
            busy
              ? { borderColor: c.borderCard, backgroundColor: c.surfaceSunken }
              : { borderColor: c.border, borderStyle: 'dashed' },
          ]}
        >
          <Icon name={busy ? 'clock' : 'image'} size={20} color={c.textTertiary} />
          <Text variant="badge" color="textTertiary">
            {busy ? 'Uploading…' : images.length ? 'Add more photos' : 'Tap to add photos'}
          </Text>
        </Tappable>
      ) : null}

      {error ? <FieldError>{error}</FieldError> : null}
    </Box>
  );
}
