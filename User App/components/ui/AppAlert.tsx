import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal as RNModal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { easing } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

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
   * Draws the confirm button as the destructive variant — an outline, per the
   * design system's rule that a filled red button never sits in the reach
   * zone. Also picks the warning tone when none is given, because a
   * destructive question is not neutral news.
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

/** Glyph and colour role per tone. The glyph is what survives greyscale. */
const TONE: Record<AlertTone, { icon: IconName | null; role: 'success' | 'warning' | 'danger' | null }> = {
  neutral: { icon: null, role: null },
  success: { icon: 'check', role: 'success' },
  warning: { icon: 'alert', role: 'warning' },
  error: { icon: 'alert', role: 'danger' },
};

export function AlertProvider({ children }: { children: React.ReactNode }) {
  /* The queue. The head is what is on screen; the rest wait their turn. */
  const [queue, setQueue] = useState<readonly Request[]>([]);
  const current = queue[0] ?? null;

  const push = useCallback((request: Omit<Request, 'resolve'>) => {
    return new Promise<boolean>((resolve) => {
      setQueue((rest) => [...rest, { ...request, resolve } as Request]);
    });
  }, []);

  const api = useMemo<AlertApi>(
    () => ({
      alert: (options) => push({ kind: 'alert', options } as Omit<Request, 'resolve'>),
      confirm: (options) => push({ kind: 'confirm', options } as Omit<Request, 'resolve'>),
    }),
    [push],
  );

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
 * Throws rather than returning a no-op when the provider is missing: an alert
 * that silently does nothing is a failure message the user never sees, which
 * is the exact bug this component exists to prevent.
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
  const { colors, space, radius, layout, elevation } = useTheme();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(0);

  /*
   * The last request drawn, held for one beat after it is answered.
   *
   * `RNModal`'s own fade needs something to fade OUT, and the queue drops the
   * request the moment it is answered — so without this the card's content
   * vanishes on the frame the dismissal starts and the modal fades an empty
   * box. Cleared when the next one arrives, so it can never be shown twice.
   */
  const held = useRef<Request | null>(null);
  if (request) held.current = request;
  const shown = request ?? held.current;

  useEffect(() => {
    progress.value = withTiming(request ? 1 : 0, { duration: 240, easing: easing.enter });
  }, [request, progress]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: reduceMotion ? 1 : 0.96 + progress.value * 0.04 }],
  }));

  if (!shown) return null;

  const isConfirm = shown.kind === 'confirm';
  const options = shown.options;
  const tone: AlertTone =
    options.tone ?? (isConfirm && (options as ConfirmOptions).destructive ? 'warning' : 'neutral');
  const { icon, role } = TONE[tone];
  const set = role ? colors[role] : null;

  /* A confirm dismissed any way other than its confirm button is a "no". */
  const dismiss = () => onAnswer(false);

  return (
    <RNModal
      visible={Boolean(request)}
      transparent
      animationType="fade"
      /* Android's back button. It answers the question rather than being
         swallowed, so there is no way to leave a promise unresolved. */
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <View style={[styles.host, { backgroundColor: colors.scrim, padding: layout.gutter }]}>
        {/*
          The scrim dismisses, on both kinds.

          On a confirm that is unambiguous — tapping away from a question is
          declining it, and `confirm` resolves false. The destructive action is
          never the one that happens by accident.
        */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />

        <Animated.View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            cardStyle,
            elevation.float,
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.sheet,
              padding: space[5],
              gap: space[3],
            },
          ]}
        >
          {/* The tone's glyph, in its own tinted disc. Absent on a neutral
              message, where a coloured mark would imply news that is not
              there. */}
          {icon && set ? (
            <View
              style={[
                styles.disc,
                { backgroundColor: set.tint, borderRadius: radius.pill },
              ]}
            >
              <Icon name={icon} size={24} color={set.ink} />
            </View>
          ) : null}

          <Text variant="title1">{options.title}</Text>

          {options.message ? (
            <Text variant="bodyLg" color="secondary">
              {options.message}
            </Text>
          ) : null}

          <View style={{ gap: space[2], marginTop: space[2] }}>
            {isConfirm ? (
              <>
                {/*
                  The safe choice is the LOWER one, because that is what sits
                  under the thumb — the same ordering `ConfirmModal` uses, and
                  the opposite of what the OS dialog does with its two
                  side-by-side text buttons.
                */}
                <Button
                  label={(options as ConfirmOptions).confirmLabel}
                  variant={(options as ConfirmOptions).destructive ? 'destructive' : 'primary'}
                  fullWidth
                  onPress={() => onAnswer(true)}
                />
                <Button
                  label={(options as ConfirmOptions).cancelLabel ?? 'Cancel'}
                  variant="secondary"
                  fullWidth
                  onPress={dismiss}
                />
              </>
            ) : (
              <Button
                label={(options as AlertOptions).dismissLabel ?? 'Got it'}
                variant="primary"
                fullWidth
                onPress={dismiss}
              />
            )}
          </View>
        </Animated.View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /* Capped like every other centred card in the system, so it does not stretch
     to the full width of a tablet. */
  card: { width: '100%', maxWidth: 400 },
  disc: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
