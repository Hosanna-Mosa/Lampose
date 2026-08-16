import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { FieldLabel } from './Field';
import { radius } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

/**
 * Single-slot upload toggle for a guest's Aadhar card. No camera/file picker
 * is wired up anywhere in this app — like every other "upload" surface in the
 * design set, this is a state toggle standing in for one.
 *
 * Shared by the request KYC screen and manual "Add customer" entry — both
 * collect the same Aadhar-on-file proof for a guest not already on the app.
 */
export function AadharUploadTile({ uploaded, onToggle }: { uploaded: boolean; onToggle: () => void }) {
  const c = useColors();
  return (
    <View>
      <FieldLabel>Upload Aadhar</FieldLabel>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={uploaded ? 'Remove uploaded Aadhar card' : 'Upload Aadhar card'}
        style={[
          styles.tile,
          uploaded
            ? { borderColor: c.success, backgroundColor: c.successTint }
            : { borderColor: c.border, borderStyle: 'dashed' },
        ]}
      >
        <Icon name={uploaded ? 'check-circle' : 'image'} size={20} color={uploaded ? c.success : c.textTertiary} />
        <Text variant="badge" color={uploaded ? 'successOnTint' : 'textTertiary'}>
          {uploaded ? 'Uploaded — tap to remove' : 'Tap to upload'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    height: 64,
    borderWidth: 1.5,
    borderRadius: radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
