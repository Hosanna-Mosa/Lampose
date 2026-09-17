import { Box, Tappable } from '@/components/common';
import { Text, Badge, Card, Icon,  } from '@/components/common';
import { type ManualCustomer } from '@/services/api/addCustomer.api';
import { formatPhone } from '@/components/common';
import { formatDateLong } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/customers/styles';

export function CustomerCard({
  customer,
  onEdit,
  onDelete,
}: {
  customer: ManualCustomer;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const c = useColors();

  const readableDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : formatDateLong(d);
  };

  /* The number is stored E.164; the app has always shown the ten digits. */
  const phone = customer.guestPhone.replace(/\D/g, '').slice(-10);
  const documents = Array.isArray(customer.kyc?.documents) ? customer.kyc.documents : [];
  const collectedCount = documents.filter((d) => d.collected).length;

  return (
    <Card style={styles.card}>
      <Box style={styles.head}>
        <Box style={styles.headText}>
          <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
            {customer.guestName || 'Unnamed guest'}
          </Text>
          <Text variant="caption" color="textSecondary">
            +91 {formatPhone(phone)}
          </Text>
        </Box>
        {/*
          The verified badge is the server's, not a local flag.
          `verifiedAt` is written only after a code the server generated came
          back correct — it is the difference between a number somebody typed
          and a number somebody answered.
        */}
        <Badge
          label={customer.kyc?.verifiedAt ? 'Verified' : 'Unverified'}
          tone={customer.kyc?.verifiedAt ? 'success' : 'warning'}
        />
      </Box>

      <Box style={[styles.stayRow, { borderTopColor: c.borderSubtle }]}>
        <Box style={styles.stayCol}>
          <Text variant="badge" color="textTertiary">
            Check-in
          </Text>
          <Text variant="bodySm">{readableDate(customer.checkInDate)}</Text>
        </Box>
        <Box style={styles.stayCol}>
          <Text variant="badge" color="textTertiary">
            Check-out
          </Text>
          <Text variant="bodySm">{readableDate(customer.checkOutDate)}</Text>
        </Box>
      </Box>

      <Text variant="caption" color="textSecondary">
        {[customer.shareType, customer.guestsLabel].filter(Boolean).join(' · ') || '—'}
      </Text>

      {customer.kyc?.address ? (
        <Text variant="caption" color="textTertiary" style={styles.address}>
          {customer.kyc.address}
        </Text>
      ) : null}

      {/* A physical checklist, not a photograph — see
          components/DocumentsChecklist.tsx. Each row is what the owner typed
          and whether they have ticked it as actually seen. */}
      {documents.length > 0 ? (
        <Box style={styles.docList}>
          {documents.map((doc, i) => (
            <Box key={`${doc.name}-${i}`} style={styles.docRow}>
              <Icon
                name={doc.collected ? 'check-circle' : 'alert-circle'}
                size={14}
                color={doc.collected ? c.success : c.textTertiary}
              />
              <Text variant="badge" color={doc.collected ? 'textSecondary' : 'textTertiary'}>
                {doc.name}
              </Text>
            </Box>
          ))}
          <Text variant="caption" color="textTertiary" style={styles.docSummary}>
            {collectedCount} of {documents.length} confirmed
          </Text>
        </Box>
      ) : (
        <Text variant="badge" color="textTertiary">
          No documents noted
        </Text>
      )}

      {/*
        Edit and Delete, separated by a rule and by distance.

        Delete is last, on the right, and is the only thing on the card drawn
        in the error colour — the standing rule that a destructive action is
        never adjacent to the ordinary one, so a thumb travelling to Edit never
        passes over it.
      */}
      <Box style={[styles.actions, { borderTopColor: c.borderSubtle }]}>
        <Tappable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${customer.guestName || 'this customer'}`}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="edit" size={15} color={c.textSecondary} />
          <Text variant="link" color="textSecondary">
            Edit
          </Text>
        </Tappable>

        <Tappable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${customer.guestName || 'this customer'}`}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="trash" size={15} color={c.error} />
          <Text variant="link" style={{ color: c.error }}>
            Delete
          </Text>
        </Tappable>
      </Box>
    </Card>
  );
}
