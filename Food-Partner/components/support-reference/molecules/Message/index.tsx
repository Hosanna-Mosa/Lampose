import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Btn, Card, Chip, DataRow, Rule, Text, TopBar, type IconName } from "@/components/common";
import { clockWords, stampWords } from "@/lib/when";
import {
  BODY_MAX_FALLBACK,
  categoryWords,
  fetchTicket,
  markTicketRead,
  replyToTicket,
  watchTicket,
  STATUS_WORD,
  type SupportMessage,
  type SupportThread,
  type TicketStatus,
} from "@/services/support";
import { colors, layout, radius, space } from "@/theme";

const styles = StyleSheet.create({
  bubble: {
    maxWidth: "88%",
    gap: 3,
    padding: space[3],
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleRow: { flexDirection: "row" },
  mine: { backgroundColor: colors.brandTint, borderColor: colors.brandOnDark },
  mineRow: { justifyContent: "flex-end" },
  system: { gap: space[2], paddingVertical: space[1] },
  theirs: { backgroundColor: colors.surface, borderColor: colors.border },
  theirsRow: { justifyContent: "flex-start" },
});

export function Message({ message }: { message: SupportMessage }) {
  const at = clockWords(message.at);

  /*
   * A system line is what the queue DID, not what anybody said. It gets the
   * shape of a divider — rules above and below, centred, no bubble, no side —
   * because a bubble is the shape of a promise.
   */
  if (message.author === "system") {
    return (
      <View style={styles.system}>
        <Rule subtle />
        <Text variant="numMeta" color="tertiary" style={{ textAlign: "center" }}>
          {message.body}
          {at ? ` · ${at}` : ""}
        </Text>
        <Rule subtle />
      </View>
    );
  }

  /* `customer` is whoever FILED the ticket — this restaurant, in this app. */
  const mine = message.author === "customer";

  return (
    <View style={[styles.bubbleRow, mine ? styles.mineRow : styles.theirsRow]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        <Text variant="label" color={mine ? "brand" : "tertiary"}>
          {mine ? "You" : message.authorName || "Lampose support"}
        </Text>
        <Text variant="body">{message.body}</Text>
        {!!at && (
          <Text variant="numMeta" color="tertiary">
            {at}
          </Text>
        )}
      </View>
    </View>
  );
}
