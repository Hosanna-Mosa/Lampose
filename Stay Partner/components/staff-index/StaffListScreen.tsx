import { useEffect, useState } from 'react';
import { Box } from '@/components/common';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Badge, Avatar, EmptyState } from '@/components/common';
import { avatarToneFor, statusLabel, type StaffMember } from '@/lib/staff';
import { initials } from '@/lib/format';
import { fetchStaffApi } from '@/services/api/domain.api';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { logWarn } from '@/lib/log';
import { StaffRow } from '@/components/staff-index/molecules/StaffRow/StaffRow';
import { styles } from '@/components/staff-index/styles';

export function StaffListScreen() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadStaff();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen
      contentStyle={styles.stack}
            refreshing={refreshing}
            onRefresh={onRefresh}
            footer={<Button label="+ Invite staff" onPress={() => router.push('/staff/invite')} />}
      stickyHeader={
        <>
          <Box style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </Box>

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

