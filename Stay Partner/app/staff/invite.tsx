import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Chip,
  ChipRow,
  Input,
  PhoneField,
  PHONE_LENGTH,
  Switch,
} from '@/components/ui';
import { addStaffMember, ROLE_CHIPS, type RoleChip, type StaffPermissions } from '@/lib/staff';

const PERMISSION_ROWS: { key: keyof StaffPermissions; label: string }[] = [
  { key: 'manageBookings', label: 'Manage bookings' },
  { key: 'managePricing', label: 'Manage pricing' },
  { key: 'viewEarnings', label: 'View earnings' },
];

/**
 * Closes the 38-checkpoint build. Structurally its own screen — a form, not
 * a sheet — but the pieces are all reused: `PhoneField` from Login, `Chip`
 * from a dozen screens back, `Switch` from Settings two checkpoints ago.
 */
import { inviteStaffApi } from '@/services/api/domain.api';

export default function InviteStaffScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [role, setRole] = useState<RoleChip | null>(null);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState<StaffPermissions>({
    manageBookings: true,
    managePricing: false,
    viewEarnings: false,
  });

  const phoneComplete = phone.length === PHONE_LENGTH;
  const phoneError =
    phoneTouched && !phoneComplete && phone.length > 0
      ? `Enter a valid ${PHONE_LENGTH}-digit mobile number.`
      : undefined;

  const canSubmit = name.trim().length > 0 && phoneComplete && Boolean(role) && !saving;

  const submit = async () => {
    if (!role || !canSubmit) return;
    setSaving(true);
    try {
      await inviteStaffApi({
        name: name.trim(),
        phone: `+91${phone}`,
        role,
        permissions: Object.keys(permissions).filter((k) => (permissions as any)[k]),
      });
      addStaffMember({ name: name.trim(), role, permissions });
    } catch (err) {
      console.warn('Failed to send staff invite:', err);
    } finally {
      setSaving(false);
      router.replace('/staff');
    }
  };

  return (
    <Screen
      padX={22}
            contentStyle={styles.fill}
            footer={<Button label="Send invite" onPress={submit} disabled={!canSubmit} />}
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>
        </>
      }
    >

      <Text variant="pageTitleSm" style={styles.title}>
        Invite staff
      </Text>

      <Input
        label="Full name"
        value={name}
        onChangeText={setName}
        placeholder="Deepak Patel"
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        containerStyle={styles.field}
      />

      <View style={styles.field}>
        <PhoneField
          value={phone}
          onChangeText={(next) => {
            setPhone(next);
            if (next.length === PHONE_LENGTH) setPhoneTouched(false);
          }}
          onBlur={() => setPhoneTouched(true)}
          error={phoneError}
        />
      </View>

      <Text variant="label" style={styles.label}>
        Role
      </Text>
      <ChipRow style={styles.field}>
        {ROLE_CHIPS.map((r) => (
          <Chip key={r} label={r} selected={role === r} onPress={() => setRole(role === r ? null : r)} />
        ))}
      </ChipRow>

      <Text variant="label" style={styles.label}>
        Permissions
      </Text>
      <View style={styles.permissions}>
        {PERMISSION_ROWS.map((p) => (
          <View key={p.key} style={styles.permissionRow}>
            <Text variant="bodySm">{p.label}</Text>
            <Switch
              size="sm"
              value={permissions[p.key]}
              onChange={(next) => setPermissions((s) => ({ ...s, [p.key]: next }))}
              accessibilityLabel={p.label}
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 2 },
  title: { marginBottom: 18 },
  label: { marginBottom: 8 },
  field: { marginBottom: 16 },

  permissions: { gap: 14 },
  permissionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
