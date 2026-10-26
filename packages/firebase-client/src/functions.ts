/**
 * The callable-only entry, `@tennis/firebase-client/functions`: the Functions
 * instance, without Firestore, Storage, or Messaging. Pair it with the `/auth`
 * entry on a public page that calls a Cloud Function. The main entry
 * re-exports the same instance.
 */
export { functions } from './firebaseFunctions';
