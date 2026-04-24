import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthUser, useUserProfile } from '@tennis/firebase-client';
import { useRouter, useSegments } from 'expo-router';
import { useAppStore } from '../store/appStore';
import { useNotifications } from '../hooks/useNotifications';
import { isTutorialDone } from './(onboarding)/tutorial';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading: authLoading } = useAuthUser();
  const { profile, loading: profileLoading } = useUserProfile(firebaseUser?.uid ?? null);
  const router = useRouter();
  const segments = useSegments();
  const { setUser } = useAppStore();
  const [tutorialDone, setTutorialDone] = useState<boolean | null>(null);

  useNotifications(firebaseUser?.uid);

  // Load tutorial completion flag once on mount
  useEffect(() => {
    isTutorialDone().then(setTutorialDone);
  }, []);

  useEffect(() => {
    if (authLoading || (firebaseUser && profileLoading) || tutorialDone === null) return;

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inTutorial = segments[1] === 'tutorial';

    if (!firebaseUser) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }

    if (profile) setUser(profile);

    const hasDivision = !!profile?.divisionId;
    const tabsDest = tutorialDone ? '/(tabs)' : '/(onboarding)/tutorial';

    if (inAuth) {
      router.replace(hasDivision ? tabsDest : '/(onboarding)/division');
    } else if (!hasDivision && !inOnboarding) {
      router.replace('/(onboarding)/division');
    } else if (hasDivision && inOnboarding && !inTutorial) {
      router.replace(tabsDest);
    }
  }, [firebaseUser, authLoading, profile, profileLoading, segments, tutorialDone]);

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
            <Stack.Screen name="match/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Live Match' }} />
          </Stack>
        </AuthGuard>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
