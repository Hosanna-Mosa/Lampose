/**
 * Display helpers for a saved payout account.
 *
 * ## What used to be here
 *
 * A `METHODS` array holding two invented bank accounts and a `PAYOUTS` array
 * of four invented transfers, mutated in memory and lost on restart. Three
 * live screens read them while a fourth listed the owner's real accounts from
 * the API, so the list showed real database ids and the sheet acting on those
 * ids looked them up in the fixture, where they did not exist. Every action on
 * a saved account failed silently, and the referral cash-out screen offered a
 * bank account that belonged to nobody.
 *
 * All of it is gone. `PartnerPaymentMethod` on the server is the only list of
 * an owner's accounts, and `partner_payouts` the only record of a transfer.
 * What is left here is formatting — it holds no state and fetches nothing.
 */

/**
 * One saved account, as the screens use it.
 *
 * `last4` rather than a number: the full account number is typed once, sent
 * to the server, and never returned to the app. There is nothing to mask
 * because there is nothing here to mask.
 */
export type PayoutMethod = {
  id: string;
  /** "HDFC Bank", or "UPI" for a VPA. */
  bankName: string;
  holderName: string;
  last4: string;
  ifsc: string;
  /** UPI methods only. */
  upiId?: string;
  isDefault: boolean;
};

/** "•••• •••• •••• 4821", or the VPA itself, which is not a secret. */
export function maskedNumber(m: PayoutMethod): string {
  if (m.upiId) return m.upiId;
  return m.last4 ? `•••• •••• •••• ${m.last4}` : 'Account on file';
}

/** Short form for a row or a picker: "Bank •••• 4821". */
export function shortLabel(m: PayoutMethod | undefined): string {
  if (!m) return 'No payout method';
  if (m.upiId) return m.upiId;
  return m.last4 ? `${m.bankName} •••• ${m.last4}` : m.bankName;
}

/**
 * Map one API row onto `PayoutMethod`.
 *
 * In one place because three screens read this list and the field names on
 * the wire (`accountName`, `isPrimary`) are not the ones the UI uses. When
 * they drifted before, a screen reader read "ending undefined" to somebody
 * checking where their money goes.
 *
 * Nothing is invented for a missing field. An earlier version filled in
 * 'XXXX4321' and 'HDFC0001234' as fallbacks, which is the worst possible
 * default on a payouts screen: a plausible account that is not theirs.
 * Missing stays visibly missing.
 */
export function toPayoutMethod(row: any): PayoutMethod {
  /* `accountLast4` is what the server sends; the full number never leaves it.
     The `accountNumber` fallback covers a response from an older build. */
  const account = String(row?.accountLast4 || row?.accountNumber || '');
  const upiId = row?.type === 'upi' ? String(row?.upiId || '') : '';
  return {
    id: String(row?.id || row?._id || ''),
    bankName: row?.type === 'upi' ? 'UPI' : (row?.bankName || bankNameForIFSC(row?.ifsc) || 'Bank account'),
    holderName: row?.accountName || '',
    last4: account.slice(-4),
    ifsc: row?.ifsc || '',
    ...(upiId ? { upiId } : {}),
    isDefault: Boolean(row?.isPrimary),
  };
}

/**
 * IFSC → bank name, for display only.
 *
 * This is a SHORT list and it is allowed to miss. It used to gate the Save
 * button — `canSave` required a name back from it — which meant an owner
 * banking anywhere outside these eight could not save an account at all:
 * Bank of Baroda, Canara, Union, every co-operative and every regional rural
 * bank were refused by the app while the server would have accepted them.
 *
 * So a miss now returns null and the form shows the code itself. Whether an
 * IFSC is valid is decided by its SHAPE, which is a rule, not by this table,
 * which is a convenience.
 */
const IFSC_BANKS: Record<string, string> = {
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  SBIN: 'State Bank of India',
  UTIB: 'Axis Bank',
  KKBK: 'Kotak Mahindra Bank',
  PUNB: 'Punjab National Bank',
  YESB: 'Yes Bank',
  IDFB: 'IDFC First Bank',
  BARB: 'Bank of Baroda',
  CNRB: 'Canara Bank',
  UBIN: 'Union Bank of India',
  IOBA: 'Indian Overseas Bank',
  IDIB: 'Indian Bank',
  CBIN: 'Central Bank of India',
  MAHB: 'Bank of Maharashtra',
  BKID: 'Bank of India',
  INDB: 'IndusInd Bank',
  FDRL: 'Federal Bank',
  RATN: 'RBL Bank',
  AUBL: 'AU Small Finance Bank',
};

/** The shape the SERVER enforces — four letters, a zero, then six of either. */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Whether an IFSC could be real. The only question the Save button asks. */
export function isValidIFSC(ifsc: string): boolean {
  return IFSC_PATTERN.test(String(ifsc || '').trim().toUpperCase());
}

/** The bank's name if we happen to know it, else null. Never a gate. */
export function bankNameForIFSC(ifsc: string | undefined): string | null {
  const code = String(ifsc || '').trim().toUpperCase();
  if (!IFSC_PATTERN.test(code)) return null;
  return IFSC_BANKS[code.slice(0, 4)] ?? null;
}
