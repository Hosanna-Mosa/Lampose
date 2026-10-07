/*
  The rider's money — wallet (what Lampose owes the rider) and outstanding
  (what the rider owes Lampose, from cash taken at doors).

  Every figure is the SERVER'S, read from the rider ledger
  (`Backend/src/modules/drivers/riderLedger.service.js`). Nothing is added up
  on the phone. Amounts are PAISE, as the ledger keeps them — format with
  `paiseToRupees`.

    GET  /me/wallet                    balances, cash limit, history, withdrawals
    POST /me/repayments                a UPI payment link for the outstanding
    GET  /me/repayments/:id            did it come through?
    POST /me/withdrawals               ask for the wallet to be paid out
*/
import { api } from "@/utils/api";

const BASE = "/api/v2/drivers";

export type LedgerKind =
  | "opening"
  | "earning"
  | "cash_order"
  | "auto_adjust"
  | "cash_deposit"
  | "repayment"
  | "withdrawal"
  | "withdrawal_reversed"
  | "correction";

export type LedgerEntry = {
  id: string;
  seq: number;
  kind: LedgerKind;
  walletPaise: number;
  outstandingPaise: number;
  walletAfterPaise: number;
  outstandingAfterPaise: number;
  orderNumber: string;
  earningPaise: number;
  collectedPaise: number;
  reference: string;
  note: string;
  at: string;
};

export type Withdrawal = {
  withdrawalId: string;
  amountPaise: number;
  status: "requested" | "paid" | "rejected";
  account: { accountHolderName: string; accountLast4: string; ifscCode: string; bankName: string; upiId: string };
  requestedAt: string;
  paidAt: string | null;
  reference: string;
  rejectionReason: string;
};

export type WalletStatement = {
  /** False until Lampose switches the ledger on — show nothing new until then. */
  opened: boolean;
  walletPaise: number;
  outstandingPaise: number;
  codLimitPaise: number;
  /** At or over the limit: no cash orders until some is paid back. */
  codBlocked: boolean;
  minWithdrawalPaise: number;
  entries: LedgerEntry[];
  withdrawals?: Withdrawal[];
};

export type Repayment = {
  repaymentId: string;
  amountPaise: number;
  status: "created" | "paid" | "superseded" | "expired";
  linkUrl: string;
  expiresAt: string | null;
  paidPaise: number;
  paidAt: string | null;
};

/** ₹1,234 or ₹1,234.50 — paise shown only when there are some. */
export const paiseToRupees = (paise: number): string => {
  const rupees = Math.abs(paise) / 100;
  const text = rupees.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${paise < 0 ? "−" : ""}₹${text}`;
};

export async function fetchWallet(token: string, beforeSeq?: number): Promise<WalletStatement> {
  const query = beforeSeq ? `?before=${beforeSeq}` : "";
  const res = await api<{ data: WalletStatement }>(`${BASE}/me/wallet${query}`, { token });
  return res.data;
}

/** All of the outstanding unless `rupees` says otherwise. */
export async function startRepayment(token: string, rupees?: number): Promise<Repayment> {
  const res = await api<{ data: Repayment }>(`${BASE}/me/repayments`, {
    method: "POST",
    token,
    body: rupees == null ? {} : { amount: rupees },
  });
  return res.data;
}

export async function checkRepayment(
  token: string,
  repaymentId: string,
): Promise<{ repayment: Repayment; wallet: WalletStatement }> {
  const res = await api<{ data: { repayment: Repayment; wallet: WalletStatement } }>(
    `${BASE}/me/repayments/${encodeURIComponent(repaymentId)}`,
    { token },
  );
  return res.data;
}

/** The whole wallet unless `rupees` says otherwise. */
export async function requestWithdrawal(
  token: string,
  rupees?: number,
): Promise<{ withdrawal: Withdrawal; wallet: WalletStatement }> {
  const res = await api<{ data: { withdrawal: Withdrawal; wallet: WalletStatement } }>(
    `${BASE}/me/withdrawals`,
    { method: "POST", token, body: rupees == null ? {} : { amount: rupees } },
  );
  return res.data;
}

/** One line per ledger row, in the rider's words. */
export function describeEntry(entry: LedgerEntry): { title: string; detail: string } {
  const order = entry.orderNumber ? `Order ${entry.orderNumber}` : "";
  switch (entry.kind) {
    case "earning":
      return { title: "Delivery earning", detail: `${order} · paid online` };
    case "cash_order":
      return {
        title: "Cash collected",
        detail: `${order} · ${paiseToRupees(entry.collectedPaise)} cash, ${paiseToRupees(entry.earningPaise)} kept as your earning`,
      };
    case "auto_adjust":
      return { title: "Wallet used for dues", detail: "Your wallet paid off what you owed" };
    case "repayment":
      return { title: "Dues paid by UPI", detail: entry.note || "Thank you" };
    case "cash_deposit":
      return { title: "Cash handed over", detail: entry.note || "Recorded by Lampose" };
    case "withdrawal":
      return { title: "Withdrawal requested", detail: entry.reference };
    case "withdrawal_reversed":
      return { title: "Withdrawal returned", detail: entry.note || entry.reference };
    case "opening":
      return { title: "Opening balance", detail: entry.note || "Carried over" };
    default:
      return { title: "Adjustment", detail: entry.note || "By Lampose" };
  }
}

/** A refusal from any of these routes, as one sentence. */
export function walletErrorText(err: unknown, fallback: string): string {
  const message = (err as { message?: string } | null)?.message;
  return message && !/^Request failed/.test(message) ? message : fallback;
}
