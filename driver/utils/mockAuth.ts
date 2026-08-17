import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, ApiError } from "./api";

/**
 * Stand-in for the auth endpoints so the app can be run and demoed before the
 * backend is wired up. Accounts are kept in AsyncStorage, so an account created
 * via sign-up survives a reload and can be signed back into.
 *
 * Controlled by EXPO_PUBLIC_AUTH_MODE:
 *   mock -> always use this file
 *   api  -> always use the real endpoints
 *   unset -> mock only when no EXPO_PUBLIC_API_URL is configured
 *
 * Delete this file and the `isMockAuth` branches in `store/driverStore.ts` and
 * `app/auth.tsx` to remove demo mode entirely.
 */

const MODE = process.env.EXPO_PUBLIC_AUTH_MODE?.toLowerCase();

export const isMockAuth = MODE === "mock" || (MODE !== "api" && !API_URL);

/** The only code the mock accepts during sign-up. */
export const MOCK_OTP = "123456";

/** Pre-seeded account so there's always a way in. */
export const DEMO_ACCOUNT = {
  phone: "+919876543210",
  password: "demo1234",
  name: "Ravi Kumar",
};

const STORAGE_KEY = "driver-mock-accounts";
const NETWORK_DELAY_MS = 600;

export type AuthUser = {
  id?: string;
  _id?: string;
  name: string;
  phone: string;
  hasCompletedOnboarding?: boolean;
  identityVerified?: boolean;
};

export type AuthResponse = { token: string; user: AuthUser };

type MockAccount = {
  id: string;
  name: string;
  phone: string;
  password: string;
  hasCompletedOnboarding: boolean;
  identityVerified: boolean;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalisePhone = (phone: string) => phone.replace(/[^\d+]/g, "");

const accountId = (phone: string) => `drv_${normalisePhone(phone).replace(/\D/g, "")}`;

const tokenFor = (account: MockAccount) => `mock.${account.id}`;

const sessionFor = (account: MockAccount): AuthResponse => ({
  token: tokenFor(account),
  user: {
    id: account.id,
    name: account.name,
    phone: account.phone,
    hasCompletedOnboarding: account.hasCompletedOnboarding,
    identityVerified: account.identityVerified,
  },
});

// ── Storage ───────────────────────────────────────────────────────────────────

async function readAccounts(): Promise<Record<string, MockAccount>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MockAccount>) : {};
  } catch {
    return {};
  }
}

async function writeAccounts(accounts: Record<string, MockAccount>) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

/** Reads the account map, inserting the demo account the first time. */
async function loadAccounts(): Promise<Record<string, MockAccount>> {
  const accounts = await readAccounts();
  const demoKey = normalisePhone(DEMO_ACCOUNT.phone);

  if (!accounts[demoKey]) {
    accounts[demoKey] = {
      id: accountId(DEMO_ACCOUNT.phone),
      name: DEMO_ACCOUNT.name,
      phone: DEMO_ACCOUNT.phone,
      password: DEMO_ACCOUNT.password,
      // Ready to drive immediately — no setup wall on the demo account.
      hasCompletedOnboarding: true,
      identityVerified: true,
    };
    await writeAccounts(accounts);
  }

  return accounts;
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

export async function mockLogin(phone: string, password: string): Promise<AuthResponse> {
  await sleep(NETWORK_DELAY_MS);

  const accounts = await loadAccounts();
  const account = accounts[normalisePhone(phone)];

  if (!account) {
    throw new ApiError("No account found for that number. Please sign up first.", 404);
  }
  if (account.password !== password) {
    throw new ApiError("That password doesn't match. Try again.", 401);
  }

  return sessionFor(account);
}

export async function mockRequestOtp(phone: string): Promise<{ sent: true }> {
  await sleep(NETWORK_DELAY_MS);

  const accounts = await loadAccounts();
  if (accounts[normalisePhone(phone)]) {
    throw new ApiError("An account already exists on this number. Sign in instead.", 409);
  }

  return { sent: true };
}

export async function mockVerifyOtp(input: {
  phone: string;
  code: string;
  name: string;
  password: string;
}): Promise<AuthResponse> {
  await sleep(NETWORK_DELAY_MS);

  if (input.code !== MOCK_OTP) {
    throw new ApiError(`Wrong code. Demo mode always uses ${MOCK_OTP}.`, 400);
  }

  const accounts = await loadAccounts();
  const key = normalisePhone(input.phone);

  const account: MockAccount = {
    id: accountId(input.phone),
    name: input.name.trim() || "Driver",
    phone: input.phone,
    password: input.password,
    // New sign-ups walk through onboarding and identity verification.
    hasCompletedOnboarding: false,
    identityVerified: false,
  };

  accounts[key] = account;
  await writeAccounts(accounts);

  return sessionFor(account);
}

export async function mockMe(token: string | null): Promise<{ user: AuthUser }> {
  const accounts = await loadAccounts();
  const account = Object.values(accounts).find((a) => tokenFor(a) === token);

  if (!account) throw new ApiError("Session expired.", 401);

  return { user: sessionFor(account).user };
}

/**
 * Mirror store-side progress back into the mock account, so onboarding and
 * identity state survive a sign-out and sign-in.
 */
export async function mockPatchAccount(
  token: string | null,
  patch: Partial<Pick<MockAccount, "hasCompletedOnboarding" | "identityVerified" | "name">>,
): Promise<void> {
  if (!token) return;

  const accounts = await loadAccounts();
  const entry = Object.entries(accounts).find(([, a]) => tokenFor(a) === token);
  if (!entry) return;

  const [key, account] = entry;
  accounts[key] = { ...account, ...patch };
  await writeAccounts(accounts);
}

/** Wipes demo accounts, including the seeded one. Handy while testing. */
export async function resetMockAccounts(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
