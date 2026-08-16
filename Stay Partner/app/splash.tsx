import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SplashView } from '@/components/SplashView';

/**
 * Inspection route for the splash, reachable from Menu → Build reference.
 * The real splash renders from the root layout during boot; this exists so it
 * can be looked at without restarting the app. Tap anywhere to leave.
 * Build-time only; delete before ship.
 */
export default function SplashRoute() {
  const router = useRouter();
  return (
    <Pressable style={styles.fill} onPress={() => router.back()} accessibilityLabel="Close splash preview">
      <SplashView />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
