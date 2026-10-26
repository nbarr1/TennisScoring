import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';

// The app and Auth only. Kept apart from config.ts so a public page that needs
// nothing but sign-in (through the `@tennis/firebase-client/auth` entry) does
// not bundle and start Firestore, Storage, Functions, and Messaging. config.ts
// re-exports both, so every caller shares one app and one Auth instance.

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Firebase services are only initialized in browser or React Native environments.
// During Next.js SSR/prerendering the module is evaluated in Node.js where there
// is no window — skipping initialization prevents auth/invalid-api-key crashes
// at build time. React Native also lacks window but needs Firebase, so it is
// detected separately via navigator.product.
export const isReactNative = (globalThis as any).navigator?.product === 'ReactNative';
export const isBrowser = typeof (globalThis as Record<string, unknown>)['window'] !== 'undefined' || isReactNative;

function assertFirebaseConfigForRuntime() {
  if (!isBrowser) return;
  const missing = [
    ['apiKey', firebaseConfig.apiKey],
    ['projectId', firebaseConfig.projectId],
    ['appId', firebaseConfig.appId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Firebase configuration is incomplete for this build. Missing: ${missing.join(', ')}. ` +
        'Set the EXPO_PUBLIC_FIREBASE_* environment variables for mobile APK builds.',
    );
  }
}

assertFirebaseConfigForRuntime();

export const app = isBrowser
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : (null as unknown as ReturnType<typeof getApp>);

function createAuth() {
  if (!isBrowser) return null as unknown as ReturnType<typeof getAuth>;
  if (isReactNative) {
    // Metro resolves 'firebase/auth' through the package's "react-native" export
    // condition, which serves @firebase/auth/dist/rn — the only build that exports
    // getReactNativePersistence. The dedicated 'firebase/auth/react-native' subpath
    // was removed in Firebase JS SDK v12, and referencing it breaks both the Metro
    // bundle and the web build (bundlers resolve this require statically even though
    // it is unreachable on web). Loading it lazily keeps the web bundle unaffected;
    // on web the named export is simply absent and this branch never runs.
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { getReactNativePersistence } = require('firebase/auth') as any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) } as any);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/already-initialized') return getAuth(app);
      throw error;
    }
  }
  return getAuth(app);
}

export const auth = createAuth();
