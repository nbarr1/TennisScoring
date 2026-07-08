import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthUser, useUserProfile } from '@tennis/firebase-client';
import { useRouter, useSegments } from 'expo-router';
import { useAppStore } from '../store/appStore';
import { useNotifications } from '../hooks/useNotifications';

function LoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f0' }}>
      <ActivityIndicator color="#1a472a" size="large" />
    </View>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading: authLoading } = useAuthUser();
  const { profile, loading: profileLoading } = useUserProfile(firebaseUser?.uid ?? null);
  const router = useRouter();
  const segments = useSegments();
  const { setUser } = useAppStore();

  useNotifications(firebaseUser?.uid);

  const dataLoading = authLoading || (!!firebaseUser && profileLoading);
  const inAuth = segments[0] === '(auth)';
  const inOnboarding = segments[0] === '(onboarding)';
  const inTutorial = (segments as string[])[1] === 'tutorial';

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
  }, [firebaseUser, dataLoading, profile, segments]);

  if (dataLoading) return <LoadingScreen />;

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
  );
}
