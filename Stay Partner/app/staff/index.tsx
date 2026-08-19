import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Badge, Avatar, EmptyState } from '@/components/ui';
import { avatarToneFor, statusLabel, type StaffMember } from '@/lib/staff';
import { initials } from '@/lib/format';
import { fetchStaffApi } from '@/services/api/domain.api';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { logWarn } from '@/lib/log';

export default function StaffListScreen() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMember[]>([]);

  const loadStaff = async () => {
    try {
      const items = await fetchStaffApi();
      const mapped: StaffMember[] = (items || []).map((s: any) => ({
        id: s.id || s._id,
        name: s.name || 'Staff Member',
        role: (s.role || 'Manager') as any,
        status: (s.status || 'active') as any,
        phone: s.phone || '',
      }));
      setStaff(mapped);
    } catch (err) {
      logWarn('Failed to load staff:', err);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  return (
    <Screen
      contentStyle={styles.stack}
            footer={<Button label="+ Invite staff" onPress={() => router.push('/staff/invite')} />}
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>

          <Text variant="screenTitle" style={styles.title}>
            Staff
          </Text>
        </>
      }
    >

      {staff.length > 0 ? (
        staff.map((m) => <StaffRow key={m.id} member={m} />)
      ) : (
        <EmptyState
          icon="user"
          title="No staff invited"
          body="Invite property managers and staff to help manage bookings."
        />
      )}
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
