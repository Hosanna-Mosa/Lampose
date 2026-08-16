import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text, TextField } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

/**
 * Screen 65 — editing the profile.
 *
 * **The phone number is read-only here.** It is the account identifier and the
 * OTP destination, so changing it is a verification flow rather than a text
 * edit — it needs a code sent to the new number *and* the old one. Presenting
 * it as an editable field that silently fails, or worse succeeds, is how
 * someone locks themselves out of a live booking. It renders as read-only with
 * the reason attached rather than as a dead grey box.
 *
 * Note for anyone comparing against the design: screen 65 in the design doc has
 * a college/institute field and a note that "changing your college updates
 * every distance in the app". Both are gone — the product revision removed the
 * institute anchor entirely, so there is no distance to recalculate.
 */
export default function EditProfile() {
  const { colors, space, layout, mode } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Edit profile" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[5], paddingBottom: space[8] }}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          label="Your name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          helper="This is what owners see on a request."
        />

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          optional
          helper="Only used for receipts and the rental agreement. We do not email offers."
        />

        {/* Read-only with the reason, not a dead grey box. */}
        <TextField
          label="Phone number"
          value={user?.phone ?? ''}
          readOnly
          helper="Changing this needs a code sent to both your old and new number. Message support and we will do it with you."
        />

        <View style={{ gap: space[2] }}>
          <Button label="Save changes" fullWidth onPress={() => router.back()} />
          <Text variant="caption" color="tertiary" style={styles.centred}>
            Changing your name does not change the name on bookings you have already made.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
});
