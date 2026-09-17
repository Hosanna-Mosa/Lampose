/* ══════════════════════════════════════════════════════════════════════════
   The app's own alert, replacing `Alert.alert`.

   ## Why the platform one had to go

   `Alert.alert` draws the OPERATING SYSTEM's dialog. It is a Material dialog
   on Android and a UIAlertController on iOS: Roboto, sentence case, its
   buttons in the platform's blue, a different shape on each OS. Everything
   else in this app is Manrope on a warm ground with the teal accent — so the
   one moment the app interrupts an owner is the one moment it stops looking
   like itself, and it looks different on the phone in the next room.

   It also cannot follow this app's dark palette, and it cannot draw a
   destructive action the way the design system does — `dangerOutline`, never a
   filled red button where a thumb rests.

   ## Imperative, because that is how it is used

   `BottomSheet` is the declarative tool and it is right when a route owns the
   thing being decided — rejecting a request, blocking dates. It is the wrong
   tool for the calls this replaces, which happen inside mutation callbacks and
   effects ("that failed, say why"), where a screen has no business holding a
   `visible` boolean just to say one sentence.

   So this is a provider with a promise-returning hook:

       const { alert, confirm } = useAlert();

       await alert({
         title: 'Could not answer',
         message: answer.error.displayMessage,
         tone: 'error',
       });

       const ok = await confirm({
         title: 'Cancel this booking?',
         message: '…',
         confirmLabel: 'Cancel booking',
         cancelLabel: 'Keep booking',
         destructive: true,
       });
       if (!ok) return;

   `confirm` resolves `false` on the cancel button, the scrim and the Android
   back button, so declining is one branch rather than three callbacks.

   ## One at a time, and the second one waits

   Requests queue. Two failures landing together used to stack two OS dialogs,
   where dismissing the top revealed a second nobody expected. Here the second
   is shown after the first is answered, in the order they were asked.

   ## Kept in step with the User App

   `User App/components/ui/AppAlert.tsx` is the same component against that
   app's own tokens. There is no workspace tooling here and no shared package,
   so the two are duplicated deliberately — the same arrangement `DeliveryMap`
   and `MapPanel` have. Change one, change the other.
   ══════════════════════════════════════════════════════════════════════════ */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal as RNModal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/common/atoms/Button';
import { Icon } from '@/components/common/atoms/Icon';
import { type IconName } from '@/components/common/atoms/Icon';
import { Text } from '@/components/common/atoms/Text';
import { radius, shadow } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

/**
 * What the dialog is about, which decides its glyph and its tint.
 *
 * Never its LAYOUT — a failure and a confirmation are the same card with the
 * buttons in the same place, because a dialog that rearranges itself by mood
 * is one people mis-tap. And never colour alone: every tone ships a glyph.
 */
export type AlertTone = 'neutral' | 'success' | 'warning' | 'error';

export type AlertOptions = {
  title: string;
  /** One or two sentences. Anything longer belongs on a screen. */
  message?: string;
  tone?: AlertTone;
  /** The single way out. "Got it", "Close". */
  dismissLabel?: string;
};

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /**
   * Draws the confirm button as `dangerOutline` — the design system's rule is
   * that a filled red button never sits in the reach zone. Also picks the
   * warning tone when none is given, because a destructive question is not
   * neutral news.
   */
  destructive?: boolean;
  tone?: AlertTone;
};

type Request =
  | { kind: 'alert'; options: AlertOptions; resolve: (value: boolean) => void }
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void };

type AlertApi = {
  /** Says one thing. Resolves when dismissed. */
  alert: (options: AlertOptions) => Promise<boolean>;
  /** Asks one thing. Resolves true only on the confirm button. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const AlertContext = createContext<AlertApi | null>(null);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  /* The queue. The head is what is on screen; the rest wait their turn. */
  const [queue, setQueue] = useState<readonly Request[]>([]);
  const current = queue[0] ?? null;

  const push = useCallback(
    (request: { kind: 'alert'; options: AlertOptions } | { kind: 'confirm'; options: ConfirmOptions }) =>
      new Promise<boolean>((resolve) => {
        setQueue((rest) => [...rest, { ...request, resolve } as Request]);
      }),
    [],
  );

  const api = useMemo<AlertApi>(
    () => ({
      alert: (options) => push({ kind: 'alert', options }),
      confirm: (options) => push({ kind: 'confirm', options }),
    }),
    [push],
  );

  /*
   * Answer the head and move on.
   *
   * Resolved inside the updater so a double tap cannot settle the same promise
   * twice — the second call finds a different head, or none.
   */
  const answer = useCallback((value: boolean) => {
    setQueue((rest) => {
      const [head, ...tail] = rest;
      if (head) head.resolve(value);
      return tail;
    });
  }, []);

  return (
    <AlertContext.Provider value={api}>
      {children}
      <AlertHost request={current} onAnswer={answer} />
    </AlertContext.Provider>
  );
}

/**
 * The hook every caller uses.
 *
 * Throws rather than no-opping when the provider is missing: an alert that
 * silently does nothing is a failure message nobody sees, which is the exact
 * bug this component exists to prevent.
 */
export function useAlert(): AlertApi {
  const context = useContext(AlertContext);
  if (!context) throw new Error('useAlert must be used inside AlertProvider');
  return context;
}

/* ------------------------------------------------------------------ *
 * The card
 * ------------------------------------------------------------------ */

function AlertHost({
  request,
  onAnswer,
}: {
  request: Request | null;
  onAnswer: (value: boolean) => void;
}) {
  const c = useColors();

  /*
   * The last request drawn, held for one beat after it is answered.
   *
   * `RNModal`'s fade needs something to fade OUT, and the queue drops the
   * request the moment it is answered — without this the card empties on the
   * frame the dismissal starts and the modal fades a blank box.
   */
  const held = useRef<Request | null>(null);
  if (request) held.current = request;
  const shown = request ?? held.current;

  if (!shown) return null;

  const isConfirm = shown.kind === 'confirm';
  const options = shown.options;
  const tone: AlertTone =
    options.tone ?? (isConfirm && (options as ConfirmOptions).destructive ? 'warning' : 'neutral');

  /* Glyph and colour role per tone. The glyph is what survives greyscale. */
  const marks: Record<AlertTone, { icon: IconName; tint: string; ink: string } | null> = {
    neutral: null,
    success: { icon: 'check-circle', tint: c.successTint, ink: c.successInk },
    warning: { icon: 'alert-circle', tint: c.warningTint, ink: c.warningInk },
    error: { icon: 'alert-circle', tint: c.errorTint, ink: c.errorInk },
  };
  const mark = marks[tone];

  /* Any dismissal other than the confirm button is a "no". */
  const dismiss = () => onAnswer(false);

  return (
    <RNModal
      visible={Boolean(request)}
      transparent
      animationType="fade"
      /* Android's back button answers the question rather than being
         swallowed, so a promise can never be left unresolved. */
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <View style={styles.host}>
        {/*
          The scrim dismisses, on both kinds.

          On a confirm that is unambiguous — tapping away from a question is
          declining it — so the destructive action is never what happens by
          accident.

          This used to be an `Animated.View` with its own `entering`/`exiting`
          fade, same as the card below. Reanimated's layout animations inside
          RN's native `Modal` are a known Android/Fabric crash source — the
          Modal tears down its own native surface at the same moment an
          `exiting` animation is mid-flight against shadow nodes on it (see
          software-mansion/react-native-reanimated#6908, #4422) — and this
          dialog is dismissed by exactly that kind of state flip: the scrim
          tap, the confirm/cancel buttons, and the queue moving to the next
          request all do it. `animationType="fade"` below already gives the
          whole modal the same fade with none of that risk.
        */}
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />

        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[styles.card, shadow.card, { backgroundColor: c.surface, borderRadius: radius.sheet }]}
        >
          {mark ? (
            <View style={[styles.disc, { backgroundColor: mark.tint }]}>
              <Icon name={mark.icon} size={22} color={mark.ink} />
            </View>
          ) : null}

          <Text variant="h3">{options.title}</Text>

          {options.message ? (
            <Text variant="body" color="textSecondary" style={styles.message}>
              {options.message}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {isConfirm ? (
              <>
                {/* The safe choice is the LOWER one, because that is what sits
                    under the thumb — the opposite of the OS dialog's two
                    side-by-side text buttons, where the destructive one is
                    often the rightmost and the easiest to hit. */}
                <Button
                  label={(options as ConfirmOptions).confirmLabel}
                  variant={(options as ConfirmOptions).destructive ? 'dangerOutline' : 'primary'}
                  onPress={() => onAnswer(true)}
                />
                <Button
                  label={(options as ConfirmOptions).cancelLabel ?? 'Cancel'}
                  variant="secondary"
                  onPress={dismiss}
                />
              </>
            ) : (
              <Button
                label={(options as AlertOptions).dismissLabel ?? 'Got it'}
                variant="primary"
                onPress={dismiss}
              />
            )}
          </View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  /* Capped so it does not stretch across a tablet, matching every other
     centred surface in the app. */
  card: { width: '100%', maxWidth: 400, padding: 22, gap: 10 },
  disc: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  message: { marginBottom: 4 },
  actions: { gap: 8, marginTop: 6 },
});
