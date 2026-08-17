import { timeOfDay } from "./format";

export type ChatAuthor = "driver" | "customer";

export type ChatMessage = {
  id: string;
  text: string;
  from: ChatAuthor;
  time: string;
  /** Set on optimistic messages until the server echoes them back. */
  pending?: boolean;
};

/**
 * Normalise an inbound socket payload into a `ChatMessage`.
 * Returns `null` for empty or malformed payloads so callers can skip them.
 */
export function formatIncomingMessage(raw: any): ChatMessage | null {
  if (!raw) return null;

  const text = String(raw.text ?? raw.message ?? "").trim();
  if (!text) return null;

  const role = String(raw.role ?? raw.senderRole ?? "").toUpperCase();
  const from: ChatAuthor = role === "DRIVER" ? "driver" : "customer";

  const stamp = raw.createdAt ?? raw.timestamp;
  const parsed = stamp ? new Date(stamp) : new Date();
  const time = Number.isNaN(parsed.getTime()) ? timeOfDay() : timeOfDay(parsed);

  return {
    id: String(raw.id ?? raw._id ?? `${parsed.getTime()}-${Math.round(Math.random() * 1e6)}`),
    text,
    from,
    time,
  };
}

/** Build the optimistic message shown immediately after the driver hits send. */
export function draftOutgoingMessage(text: string): ChatMessage {
  const trimmed = text.trim();
  return {
    id: `local-${Date.now()}`,
    text: trimmed,
    from: "driver",
    time: timeOfDay(),
    pending: true,
  };
}

/** Canned replies offered above the composer. */
export const QUICK_REPLIES = [
  "On my way",
  "Arriving in 5 minutes",
  "I'm at the gate",
  "Running slightly late",
  "Thank you!",
] as const;
