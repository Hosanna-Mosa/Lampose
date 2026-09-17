import { Box } from '@/components/common';
import { Text, Button, TextButton, Avatar, StarRow, Input } from '@/components/common';
import { formatShortDate } from '@/lib/format';
import { type Review } from '@/lib/reviews';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/reviews-index/styles';
import { toneFor } from '@/components/reviews-index/utils';

export function ReviewCard({
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
    <Box
      style={[
        styles.card,
        { borderColor: isReplying ? c.accent : c.borderCard, borderWidth: isReplying ? 1.5 : 1 },
      ]}
    >
      <Box style={styles.cardHead}>
        <Avatar label={initials} tone={tone} />
        <Box style={styles.identity}>
          <Text style={styles.name}>{review.guestName}</Text>
          <Text variant="badge" color="textCaption" style={styles.meta}>
            {review.roomType} · {formatShortDate(review.date)}
          </Text>
        </Box>
      </Box>

      <StarRow rating={review.rating} size={13} style={styles.stars} />

      <Text variant="bodySm" style={styles.reviewText}>
        {review.text}
      </Text>

      {isReplying ? (
        <Box style={styles.composer}>
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
          <Box style={styles.composerActions}>
            <Button label="Cancel" variant="secondary" size="sm" fullWidth={false} onPress={onCancel} />
            <Button
              label="Post reply"
              size="sm"
              fullWidth={false}
              disabled={!draft.trim()}
              onPress={onPost}
            />
          </Box>
        </Box>
      ) : review.reply ? (
        <Box style={[styles.replyBox, { backgroundColor: c.surfaceSunken }]}>
          <Avatar label="SV" tone="accent" solid size={24} />
          <Box style={styles.replyBody}>
            <Text style={styles.replyAuthor}>{review.reply.author}</Text>
            <Text variant="bodySm" color="textBody" style={styles.replyText}>
              {review.reply.text}
            </Text>
          </Box>
        </Box>
      ) : (
        <TextButton label="Reply" onPress={onReply} />
      )}
    </Box>
  );
}
