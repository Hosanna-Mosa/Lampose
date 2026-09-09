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
import { type Review } from '@/lib/reviews';
import { radius } from '@/constants/layout';
import { fonts, type } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

import { fetchReviewsApi, replyToReviewApi } from '@/services/api/domain.api';
import { ApiError } from '@/services/api/client';
import { fetchSummary } from '@/services/api/portfolio.api';
import { logWarn } from '@/lib/log';

const STARS = [5, 4, 3, 2, 1] as const;

function toneFor(name: string): 'accent' | 'success' | 'info' {
  const tones = ['accent', 'success', 'info'] as const;
  const sum = [...name].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return tones[sum % tones.length];
}

export default function ReviewsListScreen() {
  const router = useRouter();
  const [propertyName, setPropertyName] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  /* `null` until the server answers. Starting at 4.8 meant a brand-new owner
     with no reviews at all was shown a 4.8 for as long as the request took. */
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadReviews = async () => {
    try {
      const res = await fetchReviewsApi();
      const mapped: Review[] = (res.reviews || []).map((r: any) => ({
        id: r.id || r._id,
        guestName: r.author || r.guestName || 'Guest',
        /* Empty, not 'Deluxe Room'. A review of a room we cannot name is
           still a real review; inventing a room type puts a guest's words
           against a room that may not exist. */
        roomType: r.propertyName || r.roomType || '',
        date: new Date(r.date || Date.now()),
        rating: r.rating || 5,
        text: r.comment || r.text || '',
        reply: r.reply
          ? { author: 'Owner', text: typeof r.reply === 'string' ? r.reply : r.reply.text || '' }
          : undefined,
      }));
      setReviews(mapped);
      /* `?? null`, not `|| 4.8`: an average of 0 is a real answer, and there
         is no honest number to invent when the server sends none. */
      setAvgRating(typeof res.averageRating === 'number' ? res.averageRating : null);
    } catch (err) {
      logWarn('Failed to load reviews:', err);
    }
  };

  useEffect(() => {
    loadReviews();
    /* For the reply byline — the same summary the dashboard and Profile read. */
    fetchSummary()
      .then((sum) => setPropertyName(sum?.propertyName ?? null))
      .catch(() => { /* '(You)' alone is a fine byline. */ });
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadReviews(),
        fetchSummary()
          .then((sum) => setPropertyName(sum?.propertyName ?? null))
          .catch(() => { /* '(You)' alone is a fine byline. */ }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const startReply = (id: string) => {
    setReplyingId(id);
    setDraft('');
  };
  const cancelReply = () => {
    setReplyingId(null);
    setDraft('');
  };
  /*
   * Who the reply is from, on the row that has just been posted.
   *
   * Hardcoded to 'Sea View Villa (You)' before — the fixture property — so an
   * owner replying to a guest watched their answer appear under a business
   * name that was not theirs.
   *
   * The property name comes from the summary the rest of the app already
   * reads; '(You)' alone is the honest fallback when it has not arrived,
   * because the one thing this label must convey is that the reply is theirs.
   */
  const replyAuthor = propertyName ? `${propertyName} (You)` : 'You';

  /*
   * SAVED now, and shown to the student.
   *
   * This used to write the reply into local state and nothing else: it
   * appeared under the review, survived until the next load, and the guest it
   * was written for never saw it. There was no endpoint. There is one now, and
   * the row on screen is replaced with what the server actually stored.
   */
  const [replyError, setReplyError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const postAndClose = async (id: string) => {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    setReplyError(null);
    try {
      const saved = await replyToReviewApi(id, text);
      setReviews((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, reply: { author: replyAuthor, text: saved?.reply?.text ?? text } }
            : r
        )
      );
      setReplyingId(null);
      setDraft('');
    } catch (err) {
      setReplyError(err instanceof ApiError ? err.displayMessage : 'Could not post that reply. Try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Screen
      contentStyle={styles.stack}
      refreshing={refreshing}
      onRefresh={onRefresh}
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>

          <Text variant="screenTitle">Reviews</Text>
        </>
      }
    >

      <RatingSummary reviews={reviews} average={avgRating} />
      {replyError ? (
        <Text variant="caption" color="errorInk" style={{ marginTop: 8 }}>
          {replyError}
        </Text>
      ) : null}

      {reviews.length > 0 ? (
        reviews.map((r) => (
          <ReviewCard
            key={r.id}
            review={r}
            isReplying={replyingId === r.id}
            draft={draft}
            onChangeDraft={setDraft}
            onReply={() => startReply(r.id)}
            onCancel={cancelReply}
            onPost={() => { void postAndClose(r.id); }}
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

/**
 * The rating block, computed from the reviews on screen.
 *
 * The five bars used to be drawn from `RATING_SUMMARY.distribution` in
 * `lib/reviews.ts` — a fixed 70/20/6/3/1 across 42 reviews. Every owner saw
 * the same shape, including one with three reviews and one with none, on the
 * screen they open to find out what guests actually think of them.
 *
 * `average` still comes from the SERVER, which counts every review ever left
 * rather than the page currently loaded. The distribution is derived from what
 * is on screen because there is no endpoint for it; when the two disagree the
 * bars are the smaller truth, which is why the count under them says how many
 * they are drawn from.
 */
function RatingSummary({ reviews, average }: { reviews: Review[]; average: number | null }) {
  const count = reviews.length;

  /* Percent of the loaded reviews at each star. Zero reviews draws five empty
     tracks rather than a shape suggesting ratings nobody has left. */
  const distribution = STARS.reduce((acc, star) => {
    const n = reviews.filter((r) => Math.round(r.rating) === star).length;
    acc[star] = count > 0 ? Math.round((n / count) * 100) : 0;
    return acc;
  }, {} as Record<number, number>);

  /* The server's figure where there is one, else the mean of what is here. */
  const shown = average ?? (count > 0
    ? reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / count
    : 0);

  const c = useColors();
  return (
    <View style={[styles.summary, { borderColor: c.borderCard }]}>
      <View style={styles.summaryLeft}>
        <Text tabular style={styles.average}>
          {count > 0 ? shown.toFixed(1) : '—'}
        </Text>
        <StarRow rating={shown} size={12} />
        <Text variant="badge" color="textCaption" style={styles.count}>
          {count === 1 ? '1 review' : `${count} reviews`}
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
                  { width: `${distribution[star] ?? 0}%`, backgroundColor: c.warning },
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
  average: { ...type.metric },
  count: { fontSize: 11, marginTop: 3 },
  distribution: { flex: 1, gap: 5 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distLabel: { width: 8, fontSize: 10 },
  distTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  distFill: { height: '100%', borderRadius: 3 },

  card: { borderRadius: 14, padding: 16, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identity: { flex: 1 },
  name: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18 },
  meta: { fontSize: 11, marginTop: 1 },
  stars: { marginTop: -2 },
  reviewText: { lineHeight: 20 },

  composer: { gap: 8, marginTop: 2 },
  composerLabel: { fontSize: 12 },
  composerField: { marginBottom: 0 },
  composerActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },

  replyBox: { flexDirection: 'row', gap: 8, borderRadius: 10, padding: 12 },
  replyBody: { flex: 1 },
  replyAuthor: { fontFamily: fonts.bold, fontSize: 12, marginBottom: 2 },
  replyText: { lineHeight: 19, fontSize: 13 },
  empty: { minHeight: 260 },
});
