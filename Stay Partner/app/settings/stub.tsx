import { useLocalSearchParams } from 'expo-router';
import { Screen, TopHeader, EmptyState } from '@/components/ui';

/**
 * Shared stub for Settings rows the design set names but never designs the
 * inside of — same call as `inventory/rule.tsx`'s pricing-rule form: a real
 * push, a real back button, and an honest explanation beats a dead row or an
 * invented form. One screen, keyed by `key`, rather than a fourth near-copy.
 */
const STUBS: Record<string, { title: string; body: string }> = {
  property: {
    title: 'Property details',
    body: "Editing a property — name, address, description, photos — belongs to the onboarding wizard, which is out of scope for this build. It assumes a property already exists and is approved.",
  },
  rooms: {
    title: 'Rooms & amenities',
    body: 'Same as property details: the room and amenity editor lives in the onboarding wizard this build doesn’t include.',
  },
  profile: {
    title: 'Edit profile',
    body: 'The design set has no edit-profile form — only the one-time setup screen shown right after OTP verification, which has no back button and isn’t meant to be reopened.',
  },
};

export default function SettingsStubScreen() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  const stub = (key && STUBS[key]) || STUBS.property;

  return (
    <Screen scroll={false} header={<TopHeader title={stub.title} showBack />} background="bg">
      <EmptyState icon="edit" title="This screen was never designed" body={stub.body} />
    </Screen>
  );
}
