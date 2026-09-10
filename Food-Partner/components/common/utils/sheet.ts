import type { ToneName } from "@/theme";
/* The shape a confirm/modal sheet is described by. Lifted out when Sheet.tsx was
   split into two organisms, so the two share one definition rather than a copy. */
export type SheetSpec = {
  kicker: string;
  tone: ToneName;
  title: string;
  body: string;
  primary: string;
  secondary: string;
};
