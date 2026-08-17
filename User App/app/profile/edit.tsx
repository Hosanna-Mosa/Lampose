import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, InlineAlert, Text, TextField } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { ApiError } from '@/services';

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
  const { user, completeProfile } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Nothing to save is not an error and not a round trip — it is the Back
     button, which is what the student pressed. */
  const dirty = name.trim() !== (user?.name ?? '') || email.trim() !== (user?.email ?? '');

  const save = async () => {
    if (!dirty) {
      router.back();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      /* The email is always sent, including as an empty string. This is the
         editor: clearing the field is how somebody removes an address they no
         longer use, and omitting it would make that impossible. */
      await completeProfile({ name: name.trim(), email: email.trim() });
      router.back();
    } catch (caught) {
      /* The server validates the email and owns the message — it is the only
         thing that knows whether the address was malformed or the session had
         expired underneath. */
      setError(
        caught instanceof ApiError
          ? caught.displayMessage
          : 'We could not save that. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Edit profile" onBack={() => router.back()} />

      <KeyboardAwareScrollViewCompat
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

        {error ? <InlineAlert tone="error" title="Not saved" body={error} /> : null}

        <View style={{ gap: space[2] }}>
          <Button
            label="Save changes"
            loadingLabel="Saving"
            loading={saving}
            disabled={saving || name.trim().length === 0}
            fullWidth
            onPress={save}
          />
          <Text variant="caption" color="tertiary" style={styles.centred}>
            Changing your name does not change the name on bookings you have already made.
          </Text>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
});
