import { StyleSheet } from 'react-native';
import { Tappable } from '@/components/common';
import { useRouter } from 'expo-router';
import { SplashView } from '@/components/SplashView';

/**
 * Inspection route for the splash, reachable from Menu → Build reference.
 * The real splash renders from the root layout during boot; this exists so it
 * can be looked at without restarting the app. Tap anywhere to leave.
 * Build-time only; delete before ship.
 */
export function SplashRouteScreen() {
  const router = useRouter();
  return (
    <Tappable style={styles.fill} onPress={() => router.back()} accessibilityLabel="Close splash preview">
      <SplashView />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
