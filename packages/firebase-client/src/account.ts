import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

export async function deleteAccountCallable(): Promise<{ success: boolean }> {
  const callable = httpsCallable<Record<string, never>, { success: boolean }>(functions, 'deleteAccount');
  const result = await callable({});
  return result.data;
}
