import { useLocalSearchParams } from 'expo-router';
import { Screen, TopHeader, EmptyState } from '@/components/ui';
import { getRule } from '@/lib/pricing';

/**
 * The design set contains no add/edit form for a pricing rule — only the list
 * row and its icons. Left as a stub rather than invented; see the build record.
 */
export default function RuleEditorStub() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const rule = getRule(id);
  return (
    <Screen scroll={false} header={<TopHeader title={rule ? 'Edit rule' : 'Add rule'} showBack />} background="bg">
      <EmptyState
        icon="edit"
        title="This form was never designed"
        body={
          rule
            ? `Editing "${rule.name}" needs a name, a date range, and a rate — none of which exist in the design set.`
            : 'Adding a rule needs a name, a date range, and a rate — none of which exist in the design set.'
        }
      />
    </Screen>
  );
}
