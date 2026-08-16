import { Stack, useRouter } from 'expo-router';
import { Screen, EmptyState } from '@/components/ui';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen scroll={false} background="bg">
        <EmptyState
            icon="search"
            title="This screen doesn't exist"
            body="The link you followed points somewhere that isn't part of the app."
            actionLabel="Go to Today"
            onAction={() => router.replace('/')}
        />
      </Screen>
    </>
  );
}
