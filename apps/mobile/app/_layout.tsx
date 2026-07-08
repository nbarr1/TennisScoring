import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { View, ActivityIndicator, Text, ScrollView, TouchableOpacity } from 'react-native';
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

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading: authLoading, error: authError } = useAuthUser();
  const [retryKey, setRetryKey] = useState(0);
  const { user: profile, loading: profileLoading, error: profileError } = usePrivateUser(firebaseUser?.uid ?? null, retryKey);
  const router = useRouter();
  const segments = useSegments();
  const { setUser } = useAppStore();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useNotifications(firebaseUser?.uid);

  const dataLoading = authLoading || (!!firebaseUser && profileLoading);
  const inAuth = segments[0] === '(auth)';
  const inOnboarding = segments[0] === '(onboarding)';
  const inTutorial = (segments as string[])[1] === 'tutorial';

  useEffect(() => {
    if (!dataLoading) {
      setLoadingTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => setLoadingTimedOut(true), 15000);
    return () => clearTimeout(timeout);
  }, [dataLoading, retryKey]);

  useEffect(() => {
    if (dataLoading) return;

    if (!firebaseUser) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }

    if (profile) setUser(profile);

    const hasDivision = !!profile?.divisionId;
    const tutorialDone = !!profile?.tutorialDone;
    const tabsDest = tutorialDone ? '/(tabs)' : '/(onboarding)/tutorial';

    if (inAuth) {
      router.replace(hasDivision ? tabsDest : '/(onboarding)/division');
    } else if (!hasDivision && !inOnboarding) {
      router.replace('/(onboarding)/division');
    } else if (hasDivision && inOnboarding && !inTutorial) {
      router.replace(tabsDest);
    }
  }, [firebaseUser, dataLoading, profile, router, segments, setUser, retryKey]);

  if (authError || profileError) {
    const error = authError ?? profileError;
    return (
      <DiagnosticScreen
        title="Could not finish loading"
        message="The app could not load your account data. This is usually caused by a temporary network issue, a Firebase configuration problem, or missing account data."
        details={`uid=${firebaseUser?.uid ?? 'none'}\nerror=${error?.message ?? 'unknown'}`}
        onRetry={() => setRetryKey((key) => key + 1)}
        onSignOut={firebaseUser ? () => { void signOut(auth); setUser(null); } : undefined}
      />
    );
  }

  if (dataLoading) {
    if (loadingTimedOut) {
      return (
        <DiagnosticScreen
          title="Still loading"
          message="Loading is taking longer than expected. You can keep waiting, retry the account listener, or sign out and try again."
          details={`authLoading=${authLoading}\nprofileLoading=${profileLoading}\nuid=${firebaseUser?.uid ?? 'none'}`}
          onRetry={() => setRetryKey((key) => key + 1)}
          onSignOut={firebaseUser ? () => { void signOut(auth); setUser(null); } : undefined}
        />
      );
    }
    return <LoadingScreen />;
  }

  // Mirror the redirect conditions above: while a replace() is in flight,
  // render a loading screen instead of the stale route's content (e.g. the
  // Rankings tab briefly flashing before AuthGuard routes to onboarding).
  if (!firebaseUser) {
    if (!inAuth) return <LoadingScreen />;
  } else {
    const hasDivision = !!profile?.divisionId;
    if (inAuth) return <LoadingScreen />;
    if (!hasDivision && !inOnboarding) return <LoadingScreen />;
    if (hasDivision && inOnboarding && !inTutorial) return <LoadingScreen />;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <RootErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthGuard>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(onboarding)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="feedback" options={{ headerShown: true, title: 'Provide Feedback' }} />
              <Stack.Screen name="match/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Live Match' }} />
            </Stack>
          </AuthGuard>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
