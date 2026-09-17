import { Box } from '@/components/common';
import { Text } from '@/components/common';
import { styles } from '@/components/settings-property-edit/styles';

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box style={styles.section}>
      <Text variant="overline" color="textTertiary" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </Box>
  );
}

/**
 * Picks, uploads and lists property photographs.
 *
 * Uploading happens on pick rather than on save — see `AadharUploadTile` for
 * why: a save button that also has to wait on a multi-photo upload stalls at
 * the moment an owner expects it to finish. The cost is an orphaned Cloudinary
 * image if the form is abandoned after a pick, which is the right side to
 * err on.
 */
