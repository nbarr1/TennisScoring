import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthUser, useUserProfile } from '@tennis/firebase-client';
import { useRouter, useSegments } from 'expo-router';
import { useAppStore } from '../store/appStore';
import { useNotifications } from '../hooks/useNotifications';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading: authLoading } = useAuthUser();
  const { profile, loading: profileLoading } = useUserProfile(firebaseUser?.uid ?? null);
  const router = useRouter();
  const segments = useSegments();
  const { setUser } = useAppStore();

  useNotifications(firebaseUser?.uid);

  useEffect(() => {
    if (authLoading || (firebaseUser && profileLoading)) return;

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inTabs = segments[0] === '(tabs)';

    if (!firebaseUser) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }

    // Sync profile into store
    if (profile) setUser(profile);

    const hasDivision = !!profile?.divisionId;

    if (inAuth) {
      // Just logged in — go to onboarding or tabs
      router.replace(hasDivision ? '/(tabs)' : '/(onboarding)/division');
    } else if (!hasDivision && !inOnboarding) {
      router.replace('/(onboarding)/division');
    } else if (hasDivision && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [firebaseUser, authLoading, profile, profileLoading, segments]);

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
