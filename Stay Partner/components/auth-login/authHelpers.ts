import type { SendFailure } from '@/context/AuthContext';

/** Indian mobile numbers start with 6, 7, 8 or 9. */
export function isValidIndianMobile(digits: string): boolean {
  return /^[6-9]\d{9}$/.test(digits);
}

export function phoneError(digits: string): string | undefined {
  if (digits.length === 0) return undefined;
  if (digits.length < 10) return undefined;
  if (!/^[6-9]/.test(digits)) {
    return 'Indian mobile numbers start with 6, 7, 8 or 9. Check the first digit.';
  }
  return undefined;
}

export type SendFailureCopy = {
  headline: string;
  body: string;
  action?: string;
};

export function sendFailureCopy(
  failure: NonNullable<SendFailure>,
  params: { retryAfterLabel?: string } = {},
): SendFailureCopy {
  switch (failure) {
    case 'badNumber':
      return {
        headline: 'Invalid Phone Number',
        body: 'Please enter a valid 10-digit mobile number linked to your host account.',
        action: 'Try again',
      };
    case 'network':
      return {
        headline: 'No Internet Connection',
        body: 'Checking or sending codes requires an active internet connection.',
      };
    case 'rateLimited':
      return {
        headline: 'Too Many Tries',
        body: `Please wait ${params.retryAfterLabel ?? 'a few minutes'} before asking for another code to protect your account.`,
      };
    case 'unavailable':
    default:
      return {
        headline: "The SMS Didn't Send",
        body: 'Our SMS service encountered an issue. Please try again in a moment.',
        action: 'Try again',
      };
  }
}
