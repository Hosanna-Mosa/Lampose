import { Box } from '@/components/common';
import { Text, Badge, Avatar } from '@/components/common';
import { avatarToneFor, statusLabel, type StaffMember } from '@/lib/staff';
import { initials } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/staff-index/styles';

export function StaffRow({ member }: { member: StaffMember }) {
  const c = useColors();
  const invited = member.status === 'invited';

  return (
    <Box
      style={[
        styles.row,
        { borderColor: c.borderCard, backgroundColor: c.surface, opacity: invited ? 0.75 : 1 },
      ]}
    >
      <Avatar label={initials(member.name)} size={38} tone={avatarToneFor(member.role)} />
      <Box style={styles.info}>
        <Text style={styles.name}>{member.name}</Text>
        <Text variant="caption" color="textSecondary">
          {member.role}
        </Text>
      </Box>
      <Badge label={statusLabel(member.status)} tone={invited ? 'warning' : 'success'} />
    </Box>
  );
}
