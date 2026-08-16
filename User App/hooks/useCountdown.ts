import { useEffect, useRef, useState } from 'react';

/**
 * Seconds remaining until an absolute server deadline.
 *
 * The deadline is always a timestamp, never a duration. A device clock that is
 * ten minutes fast must not be able to tell a student their payment window
 * closed when it has not — so the offset between this device and the server is
 * applied on every read rather than baked in once.
 *
 * The hook does not decide anything at zero. It fires `onExpire` exactly once
 * and stops; what the booking becomes is the server's call, and a client clock
 * may never flip a status.
 */

/** How often to re-read, by how much is left. Ticking seconds through a
 *  forty-five minute wait costs battery and buys nothing. */
function intervalFor(secondsRemaining: number): number {
  if (secondsRemaining <= 600) return 1000;
  return 15000;
}

export type UseCountdownOptions = {
  /** serverNow − deviceNow, in milliseconds. Supplied by the API layer. */
  serverTimeOffsetMs?: number;
  onExpire?: () => void;
  /** Stops the interval without unmounting — for a screen that is not focused. */
  paused?: boolean;
};

export function useCountdown(
  deadline: string | undefined,
  { serverTimeOffsetMs = 0, onExpire, paused = false }: UseCountdownOptions = {},
) {
  const target = deadline ? new Date(deadline).getTime() : undefined;

  const read = () =>
    target === undefined ? 0 : Math.max(0, Math.round((target - (Date.now() + serverTimeOffsetMs)) / 1000));

  const [secondsRemaining, setSecondsRemaining] = useState(read);
  const fired = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (target === undefined || paused) return;

    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const next = Math.max(0, Math.round((target - (Date.now() + serverTimeOffsetMs)) / 1000));
      setSecondsRemaining(next);

      if (next <= 0) {
        // Once. A re-render must not re-fire it, and neither must a tick that
        // lands after the deadline has already passed.
        if (!fired.current) {
          fired.current = true;
          onExpireRef.current?.();
        }
        return;
      }

      timer = setTimeout(tick, intervalFor(next));
    };

    tick();
    return () => clearTimeout(timer);
  }, [target, serverTimeOffsetMs, paused]);

  // A new deadline is a new clock — an extended payment window must be able to
  // fire its own expiry.
  useEffect(() => {
    fired.current = false;
  }, [target]);

  return { secondsRemaining, expired: secondsRemaining <= 0 && target !== undefined };
}

/**
 * How a remaining time is written, by how much of it is left.
 *
 * Above ten minutes it reads in whole minutes, because ticking seconds through
 * a long wait manufactures anxiety about something the user cannot influence.
 * Below that it is mm:ss, so the last stretch is legibly finite.
 */
export function formatRemaining(secondsRemaining: number): string {
  if (secondsRemaining > 600) {
    const minutes = Math.ceil(secondsRemaining / 60);
    return minutes >= 60
      ? `${Math.floor(minutes / 60)} h ${minutes % 60} m`
      : `${minutes} min`;
  }
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
