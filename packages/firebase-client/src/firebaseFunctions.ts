import { getFunctions } from 'firebase/functions';
import { app, isBrowser } from './firebaseApp';

// Apart from config.ts for the same reason as firebaseApp.ts: the
// `/functions` entry must not start Firestore, Storage, or Messaging.
export const functions = isBrowser ? getFunctions(app) : (null as unknown as ReturnType<typeof getFunctions>);
