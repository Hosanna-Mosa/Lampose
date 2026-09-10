import React, { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, Radio, Text } from '@/components/ui';
import { useTheme, type ThemePreference } from '@/context/ThemeContext';

import { ProfileRow } from './ProfileRow';

/**
 * App appearance — the row and the sheet behind it, as one piece.
 *
 * This used to be a moon/sun button in the app header, next to the bell. It
 * was pulled out of there because the header is not where settings live: it
 * carried a control that is set once and then never touched again, in the one
 * strip of the app that has to stay legible over Food Home's artwork, and it
 * could only ever say light or dark — the default, "follow my phone", was not
 * one of the two states a tap could reach.
 *
 * ## Why the row is a door and not a switch
 *
 * The preference is `light | dark | system`, and `system` is the one worth
 * protecting: a student who set the app to follow their phone and then finds
 * a header button flipping it to a fixed mode has silently lost that setting.
 * So the row states the current answer and opens three radios, rather than
 * toggling between two of the three.
 *
 * ## Why it owns its own sheet
 *
 * Both profiles draw it — the stay side's Profile tab and Food's own profile
 * — and appearance is account-wide, so the two must never drift. Handing each
 * screen a `visible` flag and a sheet to render would be two places to keep
 * in step for a control neither screen has an opinion about. The row is the
 * whole feature; a caller supplies nothing but `last`.
 */

/**
 * What the row says without being opened.
 *
 * "Phone setting" alone is not enough — a student who set it to follow the
 * phone and then wonders why the app is dark needs to be told which way that
 * resolved, and this row is the only place that can tell them.
 */
const APPEARANCE_VALUE: Record<ThemePreference, (mode: 'light' | 'dark') => string> = {
  light: () => 'Light',
  dark: () => 'Dark',
  system: (mode) => `Phone setting · ${mode === 'dark' ? 'Dark' : 'Light'}`,
};

const APPEARANCE_OPTIONS: readonly { id: ThemePreference; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Use my phone setting' },
];

export type AppearanceRowProps = {
  /** Passed through to `ProfileRow` — whether this is the last row in its
   *  group, which is what drops the separator under it. */
  last?: boolean;
};

export function AppearanceRow({ last }: AppearanceRowProps) {
  const { space, mode, preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <ProfileRow
        label="App appearance"
        value={APPEARANCE_VALUE[preference](mode)}
        onPress={() => setOpen(true)}
        last={last}
      />

      {/*
        Three choices, not a two-state switch. A switch can only say light or
        dark, which forces a student who wants the app to follow their phone —
        the majority, and the default — to keep flipping it by hand twice a day.

        It applies on tap and persists immediately. There is no Save: a theme is
        judged by looking at it, and a preview you have to commit to is a
        preview nobody trusts.
      */}
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="App appearance">
        <View style={{ gap: space[2] }}>
          {APPEARANCE_OPTIONS.map((option) => (
            <Radio
              key={option.id}
              label={option.label}
              selected={preference === option.id}
              onSelect={() => setPreference(option.id)}
            />
          ))}
          <Text variant="caption" color="tertiary">
            Text size follows your phone in every mode — the app does not override it.
          </Text>
        </View>
      </BottomSheet>
    </>
  );
}
