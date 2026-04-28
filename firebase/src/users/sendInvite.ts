import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

export const sendInvite = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can invite users');
  }
  const { email, name } = data;
  const token = uuidv4();
  await admin.firestore().collection('invites').doc(token).set({
    email, name, invitedBy: context.auth.uid, invitedAt: new Date().toISOString(), token, accepted: false,
  });

  // Use Firebase Extensions/email or external API
  await sendEmailWithLink(email, name, token);

  return { success: true };
});
