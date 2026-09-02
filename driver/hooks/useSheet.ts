import { router } from "expo-router";
import { useMemo } from "react";
import type { SheetSpec } from "@/components/ui";
import { createTicket, supportErrorText } from "@/services/support";
import { useDriverStore } from "@/store/driverStore";
import { useFlowStore, type OverlayKey } from "@/store/flowStore";

/**
 * The four things that go wrong at a counter, and what the rider says happened.
 *
 * The label is the rider's word for it; the second string is the sentence that
 * reaches whoever opens the ticket, because "Restaurant is closed" on its own
 * arrives in a support queue with no order, no place and no verb.
 *
 * Every one of them files the SAME kind of ticket — `order`, from the driver
 * audience's own category list — and none of them does anything else. The four
 * used to announce outcomes nobody performed: an order cancelled, a ₹25 trip
 * fee credited, a restaurant contacted, support calling back. No request was
 * made for any of it. A rider who is told their order was cancelled and then
 * finds it still on their screen learns that this button lies, and the next
 * time something goes wrong at a counter they will not press it.
 */
const PROBLEMS: [label: string, said: string][] = [
  ["Order is not ready yet", "I am at the restaurant and the order is still not ready."],
  ["Restaurant is closed", "The restaurant is closed and I cannot collect this order."],
  ["An item is missing", "An item from this order is missing at the counter."],
  ["Wrong order handed to me", "The restaurant handed me the wrong order."],
];

/**
 * Builds the bottom-sheet content for whichever overlay is open, with its
 * primary action wired. Copy is transcribed from the design.
 */
export function useSheet(): {
  spec: SheetSpec | null;
  visible: boolean;
  onPrimary: () => void;
  onDismiss: () => void;
} {
  const overlay = useFlowStore((s) => s.overlay);
  const setOverlay = useFlowStore((s) => s.setOverlay);
  const say = useFlowStore((s) => s.say);
  const logout = useDriverStore((s) => s.logout);
  const releaseJob = useDriverStore((s) => s.releaseJob);
  const token = useDriverStore((s) => s.token);
  const orderNumber = useDriverStore((s) => s.currentJob?.orderNumber);

  const close = () => setOverlay(null);

  const spec = useMemo<SheetSpec | null>(() => {
    /*
      One tap, one real ticket.

      The order number goes with it, because the queue this lands in works
      several riders' problems at once and "the order is not ready" without one
      is a message somebody has to write back about. The reference comes from
      the server and is repeated to the rider, so what they are told happened
      is a thing they can go and look at in Help.
    */
    const report = (said: string) => {
      setOverlay(null);
      if (!token) {
        say("Sign in again to reach support.");
        return;
      }
      say("Sending this to support…");
      createTicket(token, {
        category: "order",
        body: said,
        ...(orderNumber ? { orderNumber } : null),
      })
        .then((thread) =>
          say(`Support has it — ticket ${thread.reference}. Their reply arrives in Help.`),
        )
        .catch((err) => say(supportErrorText(err, "We could not reach support just now.")));
    };

    /*
      Partial, because not every overlay key still has a sheet behind it.

      `withdraw` used to sit in this table: a confirmation that named a bank
      account, a handler that navigated away and a toast reading "₹3,240 sent
      to HDFC ••••8841" — with no request made anywhere and no payout system on
      the other end of it to make one to. It is gone rather than corrected,
      because there is nothing to correct it to. The key survives in
      `OverlayKey` until `flowStore` drops it, and an overlay with no spec here
      simply opens nothing.
    */
    const table: Partial<Record<Exclude<OverlayKey, null>, SheetSpec>> = {
      gps: {
        kicker: "Location off",
        tone: "danger",
        title: "Turn on GPS to go online",
        body: "Lampose needs your live location to send you delivery requests and to navigate to restaurants.",
        primary: "Open location settings",
        secondary: "Not now",
      },
      permission: {
        kicker: "Permission needed",
        tone: "danger",
        title: "Allow location access",
        body: 'Set location to "Allow all the time" so orders keep coming while the app is in the background.',
        primary: "Allow location",
        secondary: "Cancel",
      },
      network: {
        kicker: "Poor network",
        tone: "warning",
        title: "Weak connection",
        body: "You are still online. We will keep retrying — your orders and earnings are saved and will sync.",
        primary: "Retry now",
        secondary: "Dismiss",
      },
      server: {
        kicker: "Unable to go online",
        tone: "danger",
        title: "Something went wrong",
        body: "We could not reach Lampose servers (error 503). Try again in a moment or contact support.",
        primary: "Try again",
        secondary: "Contact support",
      },
      docexpired: {
        kicker: "Document expired",
        tone: "danger",
        title: "Your driving licence expired",
        body: "Upload a valid licence to keep receiving orders. You can stay online for 3 more days.",
        primary: "Upload new licence",
        secondary: "Later",
      },
      problem: {
        kicker: "Report a problem",
        tone: "warning",
        /* What this sheet can honestly say it does: it opens a ticket. It does
           not cancel the order, move the delivery on, or promise a fee — the
           order stays with the rider until support or the "Give back" button
           moves it, and saying otherwise here is what made the old copy
           unusable. */
        title: "What went wrong at the restaurant?",
        body: "Pick one and we will open a support ticket against this order. The delivery stays with you until support answers.",
        primary: "Write it out instead",
        secondary: "Cancel",
        list: PROBLEMS.map(([label, said]) => ({ label, onPress: () => report(said) })),
      },
      cancel: {
        kicker: "Confirm",
        tone: "danger",
        /* Not "cancel". The diner has paid and the food exists — this hands the
           order back so another rider can carry it, and calling it a
           cancellation is how a rider comes to avoid the only button that
           actually helps them out of a breakdown. */
        title: "Give this delivery back?",
        body: "We will find another rider straight away. Giving back after you have collected the food is not possible — call support instead.",
        primary: "Yes, give it back",
        secondary: "Keep delivering",
      },
      logout: {
        kicker: "Confirm",
        tone: "danger",
        title: "Log out of Lampose Driver?",
        body: "You will stop receiving delivery requests until you log in again.",
        primary: "Log out",
        secondary: "Stay logged in",
      },
    };

    return (overlay && table[overlay]) || null;
  }, [overlay, setOverlay, say, token, orderNumber]);

  const onPrimary = () => {
    switch (overlay) {
      /* None of the four fits, so the rider writes their own — into the same
         queue, pre-set to the same category, rather than into a toast.

         The order number travels with it for the same reason it travels with
         the four canned reports: this sheet is only ever opened from a job in
         hand, the form's own hint says an order number is what lets support
         fix it first time, and a rider standing at a counter should not have
         to copy `LO482913` off the screen behind the one they are typing on. */
      case "problem":
        setOverlay(null);
        router.push({
          pathname: "/support-new",
          params: { category: "order", ...(orderNumber ? { orderNumber } : null) },
        });
        break;
      case "cancel":
        setOverlay(null);
        releaseJob("Given back by the rider")
          .then(() => {
            router.replace("/");
            say("Given back. We are finding another rider.");
          })
          .catch((err) => {
            /* The server refuses this once the food has been collected, and it
               says so in words worth repeating verbatim. */
            const payload = (err as { payload?: { message?: string } } | null)?.payload;
            say(payload?.message || "We could not give that delivery back.");
          });
        break;
      case "logout":
        setOverlay(null);
        logout();
        break;
      case "docexpired":
        setOverlay(null);
        router.push("/documents");
        break;
      default:
        close();
    }
  };

  return { spec, visible: !!overlay, onPrimary, onDismiss: close };
}
