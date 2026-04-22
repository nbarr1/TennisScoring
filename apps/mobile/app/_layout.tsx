import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthUser } from '@tennis/firebase-client';
import { useRouter, useSegments } from 'expo-router';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading } = useAuthUser();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!firebaseUser && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (firebaseUser && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [firebaseUser, loading, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthGuard>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="match/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Live Match' }} />
          </Stack>
        </AuthGuard>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
