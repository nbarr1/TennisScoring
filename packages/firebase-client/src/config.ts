import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, initializeAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';
import { getFunctions } from 'firebase/functions';

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
const isReactNative = (globalThis as any).navigator?.product === 'ReactNative';
const isBrowser = typeof (globalThis as Record<string, unknown>)['window'] !== 'undefined' || isReactNative;

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

export const db = isBrowser ? getFirestore(app) : (null as unknown as ReturnType<typeof getFirestore>);

function createAuth() {
  if (!isBrowser) return null as unknown as ReturnType<typeof getAuth>;
  if (isReactNative) {
    // getReactNativePersistence only ships in the React Native auth entry, so it
    // is loaded dynamically to keep it out of the web bundle.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
    const { getReactNativePersistence } = require('firebase/auth/react-native') as any;
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
export const storage = isBrowser ? getStorage(app) : (null as unknown as ReturnType<typeof getStorage>);
export const functions = isBrowser ? getFunctions(app) : (null as unknown as ReturnType<typeof getFunctions>);

export async function getMessagingIfSupported() {
  const supported = await isSupported();
  return supported ? getMessaging(app) : null;
}
