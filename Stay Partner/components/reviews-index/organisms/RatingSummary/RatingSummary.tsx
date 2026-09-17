import { Box } from '@/components/common';
import { Text, StarRow } from '@/components/common';
import { type Review } from '@/lib/reviews';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/reviews-index/styles';
import { STARS } from '@/components/reviews-index/utils';

export function RatingSummary({ reviews, average }: { reviews: Review[]; average: number | null }) {
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
    <Box style={[styles.summary, { borderColor: c.borderCard }]}>
      <Box style={styles.summaryLeft}>
        <Text tabular style={styles.average}>
          {count > 0 ? shown.toFixed(1) : '—'}
        </Text>
        <StarRow rating={shown} size={12} />
        <Text variant="badge" color="textCaption" style={styles.count}>
          {count === 1 ? '1 review' : `${count} reviews`}
        </Text>
      </Box>

      <Box style={styles.distribution}>
        {STARS.map((star) => (
          <Box key={star} style={styles.distRow}>
            <Text variant="badge" style={styles.distLabel}>
              {star}
            </Text>
            <Box style={[styles.distTrack, { backgroundColor: c.borderSubtle }]}>
              <Box
                style={[
                  styles.distFill,
                  { width: `${distribution[star] ?? 0}%`, backgroundColor: c.warning },
                ]}
              />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
