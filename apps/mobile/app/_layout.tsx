import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { signOutReleasingPushToken, useAuthUser, usePrivateUser } from '@tennis/firebase-client';
import { useRouter, useSegments } from 'expo-router';
import { useAppStore } from '../store/appStore';
import { useNotifications } from '../hooks/useNotifications';
import { Button, LoadingState, colors, spacing, typography } from '../theme';
function LoadingScreen() {
  return <LoadingState label="Loading your account" showLabel={false} />;
}

// Release builds have no red-box/dev overlay, so an uncaught render error here
// would otherwise surface only as a silent crash/restart loop with no way to
// see why. The error is logged in every build, but the message and stack are
// shown on screen only in development: release users see a plain explanation
// instead of internals.
class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('RootErrorBoundary caught an error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView style={styles.diagScreen} contentContainerStyle={styles.diagContent}>
          <Text style={styles.diagTitle} accessibilityRole="header">
            Something went wrong
          </Text>
          {__DEV__ ? (
            <>
              <Text style={styles.diagMessage}>{this.state.error.message}</Text>
              <Text style={styles.diagDetails}>{this.state.error.stack}</Text>
            </>
          ) : (
            <Text style={styles.diagMessage}>
              The app hit an unexpected error. Try again. If it happens again, close the app and reopen it, and tell your division leader if it keeps happening.
            </Text>
          )}
          <Button
            label="Try again"
            accessibilityLabel="Try loading the app again"
            icon="arrow.clockwise"
            fullWidth
            onPress={() => this.setState({ error: null })}
          />
        </ScrollView>
      );
    }
    return this.props.children;
  }
}


function DiagnosticScreen({
  title,
  message,
  details,
  onRetry,
  onSignOut,
}: {
  title: string;
  message: string;
  details?: string;
  onRetry?: () => void;
  onSignOut?: () => void;
}) {
  return (
    <ScrollView style={styles.diagScreen} contentContainerStyle={[styles.diagContent, styles.diagCentered]}>
      <Text style={styles.diagTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.diagMessage}>{message}</Text>
      {details && __DEV__ ? <Text style={styles.diagDetails}>{details}</Text> : null}
      <View style={styles.diagActions}>
        {onRetry ? (
          <Button label="Try again" accessibilityLabel="Try loading the app again" icon="arrow.clockwise" fullWidth onPress={onRetry} />
        ) : null}
        {onSignOut ? (
          <Button label="Sign out" accessibilityLabel="Sign out and return to sign in" variant="secondary" fullWidth onPress={onSignOut} />
        ) : null}
      </View>
    </ScrollView>
  );
}

/**
 * Covers the navigator instead of replacing it.
 *
 * The gate must never unmount `<Stack>`: `router.replace()` is a no-op without a
 * mounted navigator, so a guard that swaps the navigator out for a spinner has no
 * way to navigate itself back out. A device bugreport caught exactly that -- the
 * tree churning at roughly ten mounts per second, which both pinned the UI on a
 * spinner and piled up ~570 screen fragments a minute until the saved-state
 * parcel exceeded the Binder limit and killed the process on backgrounding.
 */
function GateOverlay({ children }: { children: ReactNode }) {
  return <View style={[StyleSheet.absoluteFill, styles.overlay]}>{children}</View>;
}

// TEMPORARY DIAGNOSTIC -- remove once the churn is confirmed gone.
// Keeping the navigator mounted stops the fragment leak, but it would not stop
// something re-rendering this component at 10Hz; that would just get cheaper and
// quieter. This surfaces it in `adb logcat` (and in a bugreport's SYSTEM LOG) as
// a ReactNativeJS warning instead of silently burning battery.
const gateRenders = { count: 0, since: Date.now() };

function AuthGate() {
  const { firebaseUser, emailVerified, loading: authLoading, error: authError } = useAuthUser();
  const [retryKey, setRetryKey] = useState(0);
  const { user: profile, loading: profileLoading, error: profileError } = usePrivateUser(firebaseUser?.uid ?? null, retryKey);
  const router = useRouter();
  const segments = useSegments();
  // Selector, not destructuring: subscribing to the whole store re-rendered this
  // component on every unrelated write.
  const setUser = useAppStore((state) => state.setUser);
  const [gateTimedOut, setGateTimedOut] = useState(false);

  useNotifications(firebaseUser?.uid);

  const dataLoading = authLoading || (!!firebaseUser && profileLoading);
  const inAuth = segments[0] === '(auth)';
  const inOnboarding = segments[0] === '(onboarding)';
  const inTutorial = (segments as string[])[1] === 'tutorial';
  // Play Store review requires the privacy policy to be reachable without
  // signing in first (it's linked from the login/signup screen), so it's
  // exempt from the auth redirect like `(auth)` itself.
  const inPrivacyPolicy = segments[0] === 'privacy-policy';
  const inVerifyEmail = inAuth && (segments as string[])[1] === 'verify-email';
  // The security rules refuse an unverified account everything but its own
  // users document, so it stays on the verify-email screen until it verifies.
  const needsVerification = !!firebaseUser && !emailVerified;
  const hasDivision = !!profile?.divisionId;

  // True while the current route is not where the redirect effect wants it.
  // Mirrors that effect's branches exactly, so the overlay is up for precisely
  // as long as a replace() is outstanding.
  const routeMismatch = !dataLoading && (
    !firebaseUser
      ? !inAuth && !inPrivacyPolicy
      : needsVerification
        ? !inVerifyEmail && !inPrivacyPolicy
        : inAuth || (!hasDivision && !inOnboarding) || (hasDivision && inOnboarding && !inTutorial)
  );
  const gating = dataLoading || routeMismatch;

  useEffect(() => {
    gateRenders.count += 1;
    const elapsed = Date.now() - gateRenders.since;
    if (elapsed >= 5000) {
      if (gateRenders.count > 25) {
        console.warn(`[AuthGate] ${gateRenders.count} renders in ${elapsed}ms - unexpected re-render churn`);
      }
      gateRenders.count = 0;
      gateRenders.since = Date.now();
    }
  });

  // Covers route mismatches too, not just data loading. The old guard had no
  // timeout once dataLoading went false, so a route that never resolved showed a
  // bare spinner forever with no way to diagnose it from the device.
  useEffect(() => {
    if (!gating) {
      setGateTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => setGateTimedOut(true), 15000);
    return () => clearTimeout(timeout);
  }, [gating, retryKey]);

  useEffect(() => {
    if (dataLoading) return;

    if (!firebaseUser) {
      if (!inAuth && !inPrivacyPolicy) router.replace('/(auth)/login');
      return;
    }

    if (profile) setUser(profile);

    if (needsVerification) {
      if (!inVerifyEmail && !inPrivacyPolicy) router.replace('/(auth)/verify-email');
      return;
    }

    const tutorialDone = !!profile?.tutorialDone;
    const tabsDest = tutorialDone ? '/(tabs)' : '/(onboarding)/tutorial';

    if (inAuth) {
      router.replace(hasDivision ? tabsDest : '/(onboarding)/division');
    } else if (!hasDivision && !inOnboarding) {
      router.replace('/(onboarding)/division');
    } else if (hasDivision && inOnboarding && !inTutorial) {
      router.replace(tabsDest);
    }
  }, [
    firebaseUser,
    dataLoading,
    profile,
    hasDivision,
    router,
    setUser,
    retryKey,
    inAuth,
    inOnboarding,
    inTutorial,
    inPrivacyPolicy,
    inVerifyEmail,
    needsVerification,
  ]);

  const error = authError ?? profileError;
  if (error) {
    return (
      <GateOverlay>
        <DiagnosticScreen
          title="Couldn't load your account"
          message="This is usually a brief connection problem. Check your connection and try again. If it keeps happening, sign out and sign back in."
          details={`uid=${firebaseUser?.uid ?? 'none'}\nerror=${error.message ?? 'unknown'}`}
          onRetry={() => setRetryKey((key) => key + 1)}
          onSignOut={firebaseUser ? () => { void signOutReleasingPushToken(); setUser(null); } : undefined}
        />
      </GateOverlay>
    );
  }

  if (gating) {
    if (gateTimedOut) {
      return (
        <GateOverlay>
          <DiagnosticScreen
            title="Still loading"
            message="This is taking longer than usual. Keep waiting, try again, or sign out and sign back in."
            details={`authLoading=${authLoading}\nprofileLoading=${profileLoading}\nrouteMismatch=${routeMismatch}\nsegments=${segments.join('/') || '(none)'}\nuid=${firebaseUser?.uid ?? 'none'}`}
            onRetry={() => setRetryKey((key) => key + 1)}
            onSignOut={firebaseUser ? () => { void signOutReleasingPushToken(); setUser(null); } : undefined}
          />
        </GateOverlay>
      );
    }
    return (
      <GateOverlay>
        <LoadingScreen />
      </GateOverlay>
    );
  }

  return null;
}

export default function RootLayout() {
  return (
    <RootErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <View style={{ flex: 1 }}>
            <Stack
              screenOptions={{
                headerShown: false,
                headerStyle: { backgroundColor: colors.primary },
                headerTintColor: colors.onPrimary,
                headerTitleStyle: { color: colors.onPrimary },
                contentStyle: { backgroundColor: colors.canvas },
              }}
            >
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(onboarding)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="feedback" options={{ headerShown: true, title: 'Send Feedback' }} />
              <Stack.Screen name="round-robin-scheduler" options={{ headerShown: true, title: 'Round-Robin Scheduler' }} />
              <Stack.Screen name="privacy-policy" options={{ headerShown: true, title: 'Privacy Policy' }} />
              <Stack.Screen name="match/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Live Match' }} />
            </Stack>
            <AuthGate />
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: colors.canvas,
    // The navigator below is a native (react-native-screens) view, so JS sibling
    // order alone is not enough to guarantee the overlay draws on top of it.
    zIndex: 1000,
    elevation: 24,
  },
  diagScreen: { flex: 1, backgroundColor: colors.canvas },
  diagContent: { padding: spacing.xl, paddingTop: spacing.xxxl + spacing.lg },
  diagCentered: { flexGrow: 1, justifyContent: 'center', paddingTop: spacing.xl },
  diagTitle: { ...typography.heading, color: colors.primary, marginBottom: spacing.md },
  diagMessage: { ...typography.body, color: colors.text, marginBottom: spacing.lg },
  diagDetails: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.lg },
  diagActions: { gap: spacing.md },
});
