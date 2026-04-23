import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
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

// Firebase services are only initialized in browser environments.
// During Next.js SSR/prerendering the module is evaluated in Node.js where there
// is no window — skipping initialization prevents auth/invalid-api-key crashes
// at build time. All actual Firebase calls happen inside useEffect hooks which
// only run on the client, so the null values are never used server-side.
const isBrowser = typeof (globalThis as Record<string, unknown>)['window'] !== 'undefined';

export const app = isBrowser
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : (null as unknown as ReturnType<typeof getApp>);

export const db = isBrowser ? getFirestore(app) : (null as unknown as ReturnType<typeof getFirestore>);
export const auth = isBrowser ? getAuth(app) : (null as unknown as ReturnType<typeof getAuth>);
export const storage = isBrowser ? getStorage(app) : (null as unknown as ReturnType<typeof getStorage>);
export const functions = isBrowser ? getFunctions(app) : (null as unknown as ReturnType<typeof getFunctions>);

export async function getMessagingIfSupported() {
  const supported = await isSupported();
  return supported ? getMessaging(app) : null;
}
