import { router } from "expo-router";
import { useMemo } from "react";
import type { SheetSpec } from "@/components/ui";
import { useDriverStore } from "@/store/driverStore";
import { useFlowStore, type OverlayKey } from "@/store/flowStore";

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
  const resetFlow = useFlowStore((s) => s.resetFlow);
  const logout = useDriverStore((s) => s.logout);

  const close = () => setOverlay(null);

  const spec = useMemo<SheetSpec | null>(() => {
    const withList = (items: [string, string][]) =>
      items.map(([label, toast]) => ({
        label,
        onPress: () => {
          setOverlay(null);
          say(toast);
        },
      }));

    const table: Record<Exclude<OverlayKey, null>, SheetSpec> = {
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
        title: "What went wrong at the restaurant?",
        body: "Pick an issue and support will take over. Your earnings for this trip are protected.",
        primary: "Contact support",
        secondary: "Cancel",
        list: withList([
          ["Order is not ready yet", "Support notified. Wait 5 more minutes."],
          ["Restaurant is closed", "Order cancelled. Trip fee ₹25 credited."],
          ["An item is missing", "Restaurant contacted about the missing item."],
          ["Wrong order handed to me", "Support is calling you now."],
        ]),
      },
      cancel: {
        kicker: "Confirm",
        tone: "danger",
        title: "Cancel this delivery?",
        body: "Cancelling after pickup affects your acceptance score and today's incentive progress.",
        primary: "Yes, cancel delivery",
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
      withdraw: {
        kicker: "Withdraw",
        tone: "brand",
        title: "Withdraw ₹3,240 to HDFC ••••8841?",
        body: "Instant payouts reach your bank within 30 minutes. A ₹5 processing fee applies.",
        primary: "Confirm withdrawal",
        secondary: "Cancel",
      },
    };

    return overlay ? table[overlay] : null;
  }, [overlay, setOverlay, say]);

  const onPrimary = () => {
    switch (overlay) {
      case "cancel":
        setOverlay(null);
        resetFlow();
        router.replace("/");
        say("Delivery cancelled. Support will follow up.");
        break;
      case "logout":
        setOverlay(null);
        logout();
        break;
      case "withdraw":
        setOverlay(null);
        router.push("/payouts");
        say("₹3,240 sent to HDFC ••••8841.");
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
