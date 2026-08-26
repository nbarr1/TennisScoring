import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { View, ActivityIndicator, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { auth, useAuthUser, usePrivateUser } from '@tennis/firebase-client';
import { useRouter, useSegments } from 'expo-router';
import { useAppStore } from '../store/appStore';
import { useNotifications } from '../hooks/useNotifications';
import { signOut } from 'firebase/auth';

function LoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f0' }}>
      <ActivityIndicator color="#1a472a" size="large" />
    </View>
  );
}

// Release builds have no red-box/dev overlay, so an uncaught render error here
// would otherwise surface only as a silent crash/restart loop with no way to
// see why. Surfacing it on-screen gives us a diagnosable error in the field.
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
        <ScrollView
          style={{ flex: 1, backgroundColor: '#f5f5f0' }}
          contentContainerStyle={{ padding: 24, paddingTop: 64 }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#b00020', marginBottom: 12 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 14, color: '#333', marginBottom: 12 }}>
            {this.state.error.message}
          </Text>
          <Text style={{ fontSize: 12, color: '#666' }}>{this.state.error.stack}</Text>
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
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f5f5f0' }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
    >
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#1a472a', marginBottom: 12 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 16 }}>
        {message}
      </Text>
      {details ? (
        <Text style={{ fontSize: 12, color: '#666', lineHeight: 18, marginBottom: 18 }}>
          {details}
        </Text>
      ) : null}
      <View style={{ gap: 12 }}>
        {onRetry ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Retry loading the app"
            onPress={onRetry}
            style={{ backgroundColor: '#1a472a', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        ) : null}
        {onSignOut ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Sign out and return to login"
            onPress={onSignOut}
            style={{ borderColor: '#1a472a', borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#1a472a', fontWeight: '700' }}>Sign out</Text>
          </TouchableOpacity>
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
  const { firebaseUser, loading: authLoading, error: authError } = useAuthUser();
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
  const hasDivision = !!profile?.divisionId;

  // True while the current route is not where the redirect effect wants it.
  // Mirrors that effect's branches exactly, so the overlay is up for precisely
  // as long as a replace() is outstanding.
  const routeMismatch = !dataLoading && (
    !firebaseUser
      ? !inAuth && !inPrivacyPolicy
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
  ]);

  const error = authError ?? profileError;
  if (error) {
    return (
      <GateOverlay>
        <DiagnosticScreen
          title="Could not finish loading"
          message="The app could not load your account data. This is usually caused by a temporary network issue, a Firebase configuration problem, or missing account data."
          details={`uid=${firebaseUser?.uid ?? 'none'}\nerror=${error.message ?? 'unknown'}`}
          onRetry={() => setRetryKey((key) => key + 1)}
          onSignOut={firebaseUser ? () => { void signOut(auth); setUser(null); } : undefined}
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
            message="Loading is taking longer than expected. You can keep waiting, retry the account listener, or sign out and try again."
            details={`authLoading=${authLoading}\nprofileLoading=${profileLoading}\nrouteMismatch=${routeMismatch}\nsegments=${segments.join('/') || '(none)'}\nuid=${firebaseUser?.uid ?? 'none'}`}
            onRetry={() => setRetryKey((key) => key + 1)}
            onSignOut={firebaseUser ? () => { void signOut(auth); setUser(null); } : undefined}
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
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(onboarding)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="feedback" options={{ headerShown: true, title: 'Provide Feedback' }} />
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
    backgroundColor: '#f5f5f0',
    // The navigator below is a native (react-native-screens) view, so JS sibling
    // order alone is not enough to guarantee the overlay draws on top of it.
    zIndex: 1000,
    elevation: 24,
  },
});
