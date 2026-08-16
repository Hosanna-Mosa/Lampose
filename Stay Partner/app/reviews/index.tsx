import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  TextButton,
  IconButton,
  Avatar,
  StarRow,
  Input,
  EmptyState,
} from '@/components/ui';
import { formatShortDate } from '@/lib/format';
import { RATING_SUMMARY, REVIEWS, postReply, subscribeReviews, type Review } from '@/lib/reviews';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

const STARS = [5, 4, 3, 2, 1] as const;

/** Deterministic, not random — the same reviewer always gets the same colour. */
function toneFor(name: string): 'accent' | 'success' | 'info' {
  const tones = ['accent', 'success', 'info'] as const;
  const sum = [...name].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return tones[sum % tones.length];
}

/**
 * The composer opens inline, directly under the review it replies to — the
 * design's own framing, not a pushed screen. Only one composer is open at a
 * time; switching targets discards whatever draft was mid-type, the same
 * trade-off a single "compose" slot makes anywhere else in the app.
 */
export default function ReviewsListScreen() {
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeReviews(() => setRevision((r) => r + 1)), []);

  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const startReply = (id: string) => {
    setReplyingId(id);
    setDraft('');
  };
  const cancelReply = () => {
    setReplyingId(null);
    setDraft('');
  };
  const postAndClose = (id: string) => {
    if (!draft.trim()) return;
    postReply(id, draft);
    setReplyingId(null);
    setDraft('');
  };

  return (
    <Screen contentStyle={styles.stack} key={revision}>
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <Text variant="screenTitle">Reviews</Text>

      <RatingSummary />

      {REVIEWS.length > 0 ? (
        REVIEWS.map((r) => (
          <ReviewCard
            key={r.id}
            review={r}
            isReplying={replyingId === r.id}
            draft={draft}
            onChangeDraft={setDraft}
            onReply={() => startReply(r.id)}
            onCancel={cancelReply}
            onPost={() => postAndClose(r.id)}
          />
        ))
      ) : (
        <EmptyState
          icon="star-outline"
          title="No reviews yet"
          body="Reviews appear here once a guest completes their stay."
          style={styles.empty}
        />
      )}
    </Screen>
  );
}

function RatingSummary() {
  const c = useColors();
  return (
    <View style={[styles.summary, { borderColor: c.borderCard }]}>
      <View style={styles.summaryLeft}>
        <Text tabular style={styles.average}>
          {RATING_SUMMARY.average.toFixed(1)}
        </Text>
        <StarRow rating={RATING_SUMMARY.average} size={12} />
        <Text variant="badge" color="textCaption" style={styles.count}>
          {RATING_SUMMARY.totalReviews} reviews
        </Text>
      </View>

      <View style={styles.distribution}>
        {STARS.map((star) => (
          <View key={star} style={styles.distRow}>
            <Text variant="badge" style={styles.distLabel}>
              {star}
            </Text>
            <View style={[styles.distTrack, { backgroundColor: c.borderSubtle }]}>
              <View
                style={[
                  styles.distFill,
                  { width: `${RATING_SUMMARY.distribution[star]}%`, backgroundColor: c.warning },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReviewCard({
  review,
  isReplying,
  draft,
  onChangeDraft,
  onReply,
  onCancel,
  onPost,
}: {
  review: Review;
  isReplying: boolean;
  draft: string;
  onChangeDraft: (text: string) => void;
  onReply: () => void;
  onCancel: () => void;
  onPost: () => void;
}) {
  const c = useColors();
  const tone = toneFor(review.guestName);
  const initials = review.guestName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      style={[
        styles.card,
        { borderColor: isReplying ? c.accent : c.borderCard, borderWidth: isReplying ? 1.5 : 1 },
      ]}
    >
      <View style={styles.cardHead}>
        <Avatar label={initials} tone={tone} />
        <View style={styles.identity}>
          <Text style={styles.name}>{review.guestName}</Text>
          <Text variant="badge" color="textCaption" style={styles.meta}>
            {review.roomType} · {formatShortDate(review.date)}
          </Text>
        </View>
      </View>

      <StarRow rating={review.rating} size={13} style={styles.stars} />

      <Text variant="bodySm" style={styles.reviewText}>
        {review.text}
      </Text>

      {isReplying ? (
        <View style={styles.composer}>
          <Text variant="badge" color="textSecondary" style={styles.composerLabel}>
            Your reply
          </Text>
          <Input
            value={draft}
            onChangeText={onChangeDraft}
            multiline
            minHeight={64}
            autoFocus
            placeholder={`Reply to ${review.guestName.split(' ')[0]}…`}
            containerStyle={styles.composerField}
          />
          <View style={styles.composerActions}>
            <Button label="Cancel" variant="secondary" size="sm" fullWidth={false} onPress={onCancel} />
            <Button
              label="Post reply"
              size="sm"
              fullWidth={false}
              disabled={!draft.trim()}
              onPress={onPost}
            />
          </View>
        </View>
      ) : review.reply ? (
        <View style={[styles.replyBox, { backgroundColor: c.surfaceSunken }]}>
          <Avatar label="SV" tone="accent" solid size={24} />
          <View style={styles.replyBody}>
            <Text style={styles.replyAuthor}>{review.reply.author}</Text>
            <Text variant="bodySm" color="textBody" style={styles.replyText}>
              {review.reply.text}
            </Text>
          </View>
        </View>
      ) : (
        <TextButton label="Reply" onPress={onReply} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -8 },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 16,
  },
  summaryLeft: { alignItems: 'center', flexShrink: 0 },
  average: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 36 },
  count: { fontSize: 10.5, marginTop: 3 },
  distribution: { flex: 1, gap: 5 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distLabel: { width: 8, fontSize: 10 },
  distTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  distFill: { height: '100%', borderRadius: 3 },

  card: { borderRadius: 14, padding: 16, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identity: { flex: 1 },
  name: { fontFamily: fonts.bold, fontSize: 13.5, lineHeight: 18 },
  meta: { fontSize: 11, marginTop: 1 },
  stars: { marginTop: -2 },
  reviewText: { lineHeight: 20 },

  composer: { gap: 8, marginTop: 2 },
  composerLabel: { fontSize: 11.5 },
  composerField: { marginBottom: 0 },
  composerActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },

  replyBox: { flexDirection: 'row', gap: 8, borderRadius: 10, padding: 12 },
  replyBody: { flex: 1 },
  replyAuthor: { fontFamily: fonts.bold, fontSize: 11.5, marginBottom: 2 },
  replyText: { lineHeight: 19, fontSize: 12.5 },
  empty: { minHeight: 260 },
});
