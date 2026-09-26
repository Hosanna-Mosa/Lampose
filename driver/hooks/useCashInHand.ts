import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useDriverStore } from "@/store/driverStore";
import { api } from "@/utils/api";

/**
 * The cash this rider is holding from cash-on-delivery orders — cash taken at
 * doors minus what they have handed back to Lampose. The server derives it
 * from the orders and the recorded hand-overs every time; nothing is counted
 * on the phone. Re-read whenever the screen comes into view.
 */
export type CashInHand = {
  inHandPaise: number;
  collectedPaise: number;
  depositedPaise: number;
  cashOrders: number;
};

export function useCashInHand() {
  const token = useDriverStore((s) => s.token);
  const [cash, setCash] = useState<CashInHand | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let live = true;
      api<{ data?: CashInHand }>("/api/v2/drivers/me/cash", { token })
        .then((res) => {
          if (live && res?.data) setCash(res.data);
        })
        /* An older server has no such route. Nothing is shown rather than a
           wrong number. */
        .catch(() => {});
      return () => {
        live = false;
      };
    }, [token]),
  );

  return cash;
}
