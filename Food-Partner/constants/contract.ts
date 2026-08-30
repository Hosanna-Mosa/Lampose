/* ══════════════════════════════════════════════════════════════════════════
   The partner merchant agreement, transcribed from step 4 of the website's
   onboarding flow.

   The two placeholders — {noun} and {service} — are where the web
   interpolated `copy.noun` and `copy.contractServiceText`, so a restaurant and
   a meat centre sign the same agreement with the right words in it. Filling
   them is `fillClause`, and nothing else in the app is allowed to rewrite
   this text.
   ══════════════════════════════════════════════════════════════════════════ */
import type { PartnerCopy } from "./partner";

export const CONTRACT_TITLE = "LAMPOSE PARTNER MERCHANT AGREEMENT";

export const CONTRACT_PREAMBLE =
  "This Partner Merchant Agreement (“Agreement”) is entered into between the " +
  "merchant (“Partner”) and Lampose Technologies Pvt. Ltd. (“Platform”).";

export const CONTRACT_CLAUSES: { n: number; heading: string; body: string }[] = [
  {
    n: 1,
    heading: "Services",
    body: "The Platform agrees to list the Partner's {noun} and to facilitate {service} to customers through the Lampose platform.",
  },
  {
    n: 2,
    heading: "Commission",
    body: "The Partner agrees to pay commission on each order at the agreed rate. Rates may be revised with 30 days' notice.",
  },
  {
    n: 3,
    heading: "Payment terms",
    body:
      "Amounts due to the Partner are settled weekly, net of commission, fees and applicable taxes, to the account " +
      "given in this application. The Partner is responsible for the accuracy of those bank details.",
  },
  {
    n: 4,
    heading: "Menu & pricing",
    body:
      "The Partner sets its own prices and is responsible for keeping listings, availability and descriptions accurate.",
  },
  {
    n: 5,
    heading: "Quality standards",
    body:
      "The Partner agrees to maintain the hygiene, packaging and quality standards specified by the Platform. " +
      "Non-compliance may result in de-listing.",
  },
  {
    n: 6,
    heading: "Term & termination",
    body:
      "This agreement runs until either party ends it with 30 days' written notice. The Platform may terminate " +
      "immediately for a breach of these terms.",
  },
  {
    n: 7,
    heading: "Data & privacy",
    body:
      "The Partner agrees to the collection and use of order data for analytics and platform improvement, in line " +
      "with applicable data protection law.",
  },
  {
    n: 8,
    heading: "Indemnity",
    body:
      "The Partner indemnifies the Platform against claims arising from the quality or safety of its products or " +
      "from any breach of applicable law.",
  },
];

export const CONTRACT_CLOSING =
  "Accepting below confirms that you have read, understood and agreed to all of the terms above.";

export const fillClause = (text: string, copy: PartnerCopy): string =>
  text.replace(/\{noun\}/g, copy.noun).replace(/\{service\}/g, copy.contractServiceText);
