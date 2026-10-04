import { useRouter } from 'expo-router';
import { Box, EmptyState, IconButton, Screen } from '@/components/common';
import { backRowBase } from '@/components/common/utils/styles';

/**
 * Staff & permissions — said plainly to be not built yet.
 *
 * The old screens were a facade: an invite sent no SMS, created no login a
 * staff member could use, granted no permissions anybody checked, and
 * swallowed its own errors while a local fixture pretended it had worked. An
 * owner who "invited" a manager believed somebody could now answer requests
 * for them. Until staff accounts exist on the server, both routes land here.
 */
export function StaffComingSoonScreen() {
  const router = useRouter();
  return (
    <Screen
      scroll={false}
      padX={20}
      background="bg"
      stickyHeader={(
        <Box style={backRowBase}>
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
        </Box>
      )}
    >
      <EmptyState
        icon="user"
        title="Staff accounts are coming soon"
        body="You will be able to invite a manager to answer requests and check guests in. For now, only you can sign in to this account."
        actionLabel="Go back"
        onAction={() => router.back()}
      />
    </Screen>
  );
}
