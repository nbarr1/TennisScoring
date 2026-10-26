/**
 * The sign-in-only entry, `@tennis/firebase-client/auth`: the Firebase app,
 * Auth, and `useAuthUser`, without Firestore, Storage, Functions, or
 * Messaging. For a public page that only needs the signed-in user. Anything
 * that reads or writes data imports the main entry, which shares this same
 * app and Auth instance.
 */
export { app, auth } from './firebaseApp';
export { useAuthUser } from './hooks/useAuthUser';
