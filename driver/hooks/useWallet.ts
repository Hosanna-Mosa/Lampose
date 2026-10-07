import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { fetchWallet, type WalletStatement } from "@/services/wallet";
import { useDriverStore } from "@/store/driverStore";
import socketService from "@/utils/socketService";

/**
 * The rider's wallet and outstanding, as the server has them.
 *
 * Read whenever the screen comes into view, and replaced whenever the server
 * pushes `wallet_update` — a UPI payment landing, a withdrawal paid or
 * refused. The socket is an optimisation: focusing the screen always reads
 * over HTTP as well.
 *
 * `null` until the first read, and stays `null` against an older server that
 * has no such route — nothing is shown rather than a wrong number.
 */
export function useWallet() {
  const token = useDriverStore((s) => s.token);
  const [wallet, setWallet] = useState<WalletStatement | null>(null);

  const reload = useCallback(async () => {
    if (!token) return null;
    try {
      const next = await fetchWallet(token);
      setWallet(next);
      return next;
    } catch {
      return null;
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    const onUpdate = (payload: unknown) => {
      const next = payload as Partial<WalletStatement> | null;
      if (next && typeof next.walletPaise === "number") {
        /* The push carries the newest rows only — keep any withdrawals list
           we already have rather than blanking it. */
        setWallet((prev) => ({ ...(prev ?? ({} as WalletStatement)), ...(next as WalletStatement) }));
      }
    };
    socketService.on("wallet_update", onUpdate);
    return () => socketService.off("wallet_update", onUpdate);
  }, []);

  return { wallet, setWallet, reload };
}
