/* ══════════════════════════════════════════════════════════════════════════
   Payout onboarding — what a HOTEL owner gives us before they can be paid.

   ## The owner is a PAYEE, not a merchant

   Lampose pays a hotel out of its own RazorpayX account. The owner needs no
   Razorpay account and no KYC with Razorpay — they are a beneficiary, so the
   form asks only what a bank transfer needs: a name, an account number and an
   IFSC.

   This is a deliberate reduction. An earlier version made the hotel a Razorpay
   Route sub-merchant and had to collect a legal business name, a business
   type, a PAN and a registered address before anything could settle. That
   product is not being used; asking for the rest would be collecting documents
   nothing reads.

   It still sits BESIDE `earnings/methods` rather than replacing it: that
   screen feeds the owner-initiated payout flow, this one feeds hotel
   settlements, and the two are different money.

   ## Only hotel owners ever see any of this

   `ownsHotel` is decided by the SERVER from the properties collection. A PG or
   co-living owner is paid nothing by us, so they are never asked, and the app
   never has to work out which category anybody is in.

   ## `active` means RazorpayX accepted the beneficiary

   Not that a bank has. There is no approval step on this rail — a fund account
   exists or it does not — so `active` arrives as soon as the details are
   registered. Whether the transfer itself succeeds is answered by the payout,
   and shows up in the admin queue rather than here.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from './client';
import { endpoints } from './endpoints';

export type PayoutOnboardingStatus =
  | 'none' | 'submitted' | 'under_review' | 'active' | 'rejected';

export type PayoutOnboarding = {
  /** Does this owner have a hotel at all? False for every other category. */
  ownsHotel: boolean;
  status: PayoutOnboardingStatus;
  /** The gate's question: a hotel owner who is not yet `active`. */
  required: boolean;
  /**
   * Settlements already held, releasable or failed for this owner.
   *
   * The difference between "you will need this eventually" and "your money is
   * waiting on you right now" — which is the difference between a prompt and a
   * blocked app.
   */
  settlementsWaiting: number;

  /* RazorpayX. `razorpayFundAccountId` being set is what makes an owner
     payable — it is the id every payout is addressed to. */
  razorpayContactId: string | null;
  razorpayFundAccountId: string | null;
  /* Razorpay Route, on owners onboarded before the migration. Null since. */
  linkedAccountId: string | null;
  legalBusinessName: string;
  beneficiaryName: string;
  /** The last four digits only. We never hold the full number. */
  accountLast4: string;
  ifsc: string;
  rejectionReason: string;
  submittedAt: string | null;
  activatedAt: string | null;

  /** DEVELOPMENT ONLY — whether this server allows the bypass. */
  devActivateAllowed: boolean;
};

/**
 * What a RazorpayX contact and fund account need. Three required fields.
 *
 * `legalBusinessName` and `email` are optional extras the server stores for
 * display and for the contact record; neither gates a payout.
 */
export type PayoutOnboardingInput = {
  beneficiaryName: string;
  accountNumber: string;
  ifsc: string;
  email?: string;
  legalBusinessName?: string;
};

type Envelope = { success: boolean; data: PayoutOnboarding; message?: string };

export function fetchPayoutOnboarding(signal?: AbortSignal): Promise<PayoutOnboarding> {
  return api.get<Envelope>(endpoints.payoutOnboarding, { signal }).then((r) => r.data);
}

/**
 * Send the details.
 *
 * Resolves even when Razorpay refuses — the server answers 202 with everything
 * stored, because a gateway that is slow, unreachable or (today) not yet
 * enabled for Route must not lose what somebody just typed. The returned
 * `status` says where it actually got to.
 */
export function submitPayoutOnboarding(
  input: PayoutOnboardingInput,
  signal?: AbortSignal,
): Promise<PayoutOnboarding> {
  return api.post<Envelope>(endpoints.payoutOnboarding, input, { signal }).then((r) => r.data);
}

/**
 * Finish a submission that never reached RazorpayX.
 *
 * There is no status to poll — a fund account has no lifecycle — so this is
 * only useful for the case where the details were stored but the rail was
 * unreachable. It answers 202 telling the owner to send them again when it
 * cannot be finished, because the account number was never kept.
 */
export function refreshPayoutOnboarding(signal?: AbortSignal): Promise<PayoutOnboarding> {
  return api.post<Envelope>(endpoints.payoutOnboardingRefresh, undefined, { signal })
    .then((r) => r.data);
}

/**
 * DEVELOPMENT ONLY — mark this owner payable without Razorpay.
 *
 * Until RazorpayX is configured on the server no fund account can be created,
 * and nothing downstream of this gate can be reached. The server refuses this
 * unless it allows it (`devActivateAllowed`), and the fund account id it
 * writes is deliberately fake, so a real payout against it fails loudly at
 * RazorpayX rather than looking genuine.
 *
 * Delete this and the button that calls it once Route is live.
 */
export function devActivatePayout(signal?: AbortSignal): Promise<PayoutOnboarding> {
  return api.post<Envelope>(endpoints.payoutOnboardingDevActivate, undefined, { signal })
    .then((r) => r.data);
}
