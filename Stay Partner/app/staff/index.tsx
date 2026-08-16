import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Badge, Avatar } from '@/components/ui';
import { STAFF, avatarToneFor, statusLabel, subscribeStaff, type StaffMember } from '@/lib/staff';
import { initials } from '@/lib/format';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

export default function StaffListScreen() {
  const router = useRouter();

  // A sent invite has to actually show up here — same subscription shape as
  // every other mutable list in the app.
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeStaff(() => setRevision((r) => r + 1)), []);

  return (
    <Screen
      contentStyle={styles.stack}
      key={revision}
      footer={<Button label="+ Invite staff" onPress={() => router.push('/staff/invite')} />}
    >
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <Text variant="screenTitle" style={styles.title}>
        Staff
      </Text>

      {STAFF.map((m) => (
        <StaffRow key={m.id} member={m} />
      ))}
    </Screen>
  );
}

function StaffRow({ member }: { member: StaffMember }) {
  const c = useColors();
  const invited = member.status === 'invited';

  return (
    <View
      style={[
        styles.row,
        { borderColor: c.borderCard, backgroundColor: c.surface, opacity: invited ? 0.75 : 1 },
      ]}
    >
      <Avatar label={initials(member.name)} size={38} tone={avatarToneFor(member.role)} />
      <View style={styles.info}>
        <Text style={styles.name}>{member.name}</Text>
        <Text variant="caption" color="textSecondary">
          {member.role}
        </Text>
      </View>
      <Badge label={statusLabel(member.status)} tone={invited ? 'warning' : 'success'} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -6 },
  title: { marginBottom: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 14,
  },
  info: { flex: 1, gap: 3 },
  name: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18 },
});
