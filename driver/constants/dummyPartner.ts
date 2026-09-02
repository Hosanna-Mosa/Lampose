/* ══════════════════════════════════════════════════════════════════════════
   The "Fill with dummy data" shortcut, for walking the sign-up flow quickly.

   Partner sign-up is four steps, five documents and about twenty fields, and
   getting to the end of it is a prerequisite for testing anything downstream:
   the approval queue, the duty switch, the dispatcher, the whole delivery
   loop. Typing a plausible licence number for the ninth time is not a test of
   anything, so each step offers to fill itself and move on.

   ## What it will NOT fill, and why

   The fields a real account is IDENTIFIED by stay real:

     · the mobile number — it is the account, it receives an actual SMS code,
       and dummying it would mean a session belonging to somebody's number.
     · the email address — a payout statement goes to it.
     · the date of birth — it is checked against the ID an approver reads, and
       it is the one field with a rule behind it (the 18-year floor).

   Pressing the button with one of those still empty is refused, and the field
   says so. Filling them in for you would defeat the point of collecting them.

   There is no password to keep real: the Driver app has none and is not going
   to have one — a rider signs in with a number and a six-digit code, the same
   decision the customer app made. See `app/auth.tsx`.

   ## Not in production

   `DUMMY_DATA_ENABLED` is `__DEV__` by default, so nothing here reaches a
   rider who downloaded the app. `EXPO_PUBLIC_ALLOW_DUMMY_DATA=true` turns it
   on in a preview or internal build — for a demo, or for QA on a device where
   `__DEV__` is false. It is deliberately opt-in per build rather than always
   on: a real partner who found this button would file an account an approver
   then has to reject.

   The document scans are placeholder URLs rather than uploads. They are stored
   verbatim by `POST /me/documents`, which takes strings and does not care
   where they came from, so the admin console's "View" link opens a real
   picture and the queue looks the way it will with real scans — without
   needing `CLOUDINARY_*` configured to walk the flow. The camera and gallery
   path beside it is untouched, and is what to use when the upload itself is
   the thing being tested.
   ══════════════════════════════════════════════════════════════════════════ */
import type { DocumentKind, Vehicle } from "@/store/driverStore";

/** Off in a shipped build unless a build explicitly asks for it. */
export const DUMMY_DATA_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_ALLOW_DUMMY_DATA === "true";

/** The fields the button refuses to invent. Named so the copy can list them. */
export const REAL_FIELDS = ["your mobile number", "your email", "your date of birth"] as const;

export const DUMMY_PERSONAL = {
  name: "Arjun Kumar",
  city: "Rajahmundry",
  /* A real-looking Rajahmundry address. Not a real one: the door number is
     made up and the pincode is the city's own, so nothing here resolves to
     somebody's house. */
  address: {
    kind: "home" as const,
    line1: "12-3-45, Danavaipeta",
    landmark: "Near the temple",
    city: "Rajahmundry",
    pincode: "533103",
  },
  /* A face, so the profile row and the admin console both have something to
     show. Left out of the patch if the rider already picked a real one. */
  profilePhotoUrl: "https://placehold.co/400x400/0F5F52/FFFFFF/png?text=AK",
} as const;

export const DUMMY_VEHICLE: { type: NonNullable<Vehicle["type"]>; plate: string; model: string } = {
  type: "bike",
  plate: "AP05CJ4471",
  model: "Honda Activa 6G",
};

export const DUMMY_PAYOUT = {
  accountHolderName: "Arjun Kumar",
  bankName: "HDFC Bank",
  /* Fourteen digits, inside the 9–18 the server accepts. Not a real account:
     the HDFC prefix is right and the rest is not allocated. */
  bankAccountNumber: "50100123458841",
  ifscCode: "HDFC0001432",
  accountType: "savings" as const,
  upiId: "arjun@okhdfcbank",
};

/**
 * The three documents without which nobody can be approved.
 *
 * PAN and insurance are deliberately left out. They are optional, so leaving
 * them absent is both realistic and useful: it is the only way to see the
 * "Not sent" row in the app and in the console without hand-editing a
 * document back out of the database.
 */
export const DUMMY_DOCUMENTS: {
  kind: DocumentKind;
  number: string;
  frontUrl: string;
  backUrl: string;
}[] = [
  {
    kind: "licence",
    number: "AP0320190004471",
    frontUrl: placeholder("Driving+Licence+FRONT"),
    backUrl: placeholder("Driving+Licence+BACK"),
  },
  {
    kind: "rc",
    number: "AP05CJ4471",
    frontUrl: placeholder("RC+Book+FRONT"),
    backUrl: placeholder("RC+Book+BACK"),
  },
  {
    kind: "aadhaar",
    number: "XXXX-XXXX-4412",
    frontUrl: placeholder("Aadhaar+FRONT"),
    backUrl: placeholder("Aadhaar+BACK"),
  },
];

/** A readable card at roughly a document's aspect ratio. */
function placeholder(text: string): string {
  return `https://placehold.co/900x560/E8E6E1/1A1A1A/png?text=${text}`;
}
