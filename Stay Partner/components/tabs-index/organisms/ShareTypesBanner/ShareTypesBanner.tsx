import { useCallback, useState } from 'react';
import { Box } from '@/components/common';
import { useFocusEffect } from 'expo-router';
import { Text, Card, Icon } from '@/components/common';
import { setShareTypes, visibleCount as visibleShareTypes } from '@/lib/shareTypes';
import { useColors } from '@/hooks/useColors';
import { fetchShareTypesApi } from '@/services/api/domain.api';
import { styles } from '@/components/tabs-index/styles';

export function ShareTypesBanner({ onPress }: { onPress: () => void }) {
  const c = useColors();
  const [total, setTotal] = useState(0);
  const [, force] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      fetchShareTypesApi()
        .then((rows: any) => {
          if (!live) return;
          const mapped = (Array.isArray(rows) ? rows : []).map((st: any) => ({
            id: st.shareTypeId || st.id || st._id,
            label: st.name || 'Room',
            pricePerBed: `₹${(st.monthlyPrice || 0).toLocaleString('en-IN')}`,
            available: Boolean(st.isAvailable),
          }));
          setShareTypes(mapped);
          setTotal(mapped.length);
          force((n) => n + 1);
        })
        .catch(() => { /* The banner simply shows nothing rather than a guess. */ });
      return () => { live = false; };
    }, []),
  );

  const visible = visibleShareTypes();
  return (
    <Card variant="elevated" onPress={onPress} style={styles.banner}>
      <Box style={[styles.bannerIcon, { backgroundColor: c.accentTint }]}>
        <Icon name="bed" size={18} color={c.accent} />
      </Box>
      <Box style={styles.bannerBody}>
        <Text variant="cardTitle" style={styles.bannerTitle}>
          Share types
        </Text>
        <Text variant="badge" color="textSecondary">
          {total === 0 ? 'None recorded yet' : `${visible} of ${total} visible to customers`}
        </Text>
      </Box>
      <Icon name="chevron-right" size={14} color={c.textTertiary} strokeWidth={2} />
    </Card>
  );
}
