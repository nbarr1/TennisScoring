import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';
import { app, isBrowser } from './firebaseApp';

export { app, auth } from './firebaseApp';
export { functions } from './firebaseFunctions';

export const db = isBrowser ? getFirestore(app) : (null as unknown as ReturnType<typeof getFirestore>);

export const storage = isBrowser ? getStorage(app) : (null as unknown as ReturnType<typeof getStorage>);

export async function getMessagingIfSupported() {
  const supported = await isSupported();
  return supported ? getMessaging(app) : null;
}
