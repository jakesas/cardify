import admin from 'firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';

let initialized = false;

function getApp(): admin.app.App {
  if (!initialized) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } else {
      admin.initializeApp({ projectId });
    }
    initialized = true;
  }
  return admin.app();
}

export async function verifyAuth(authHeader: string | undefined): Promise<DecodedIdToken> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }
  const token = authHeader.slice(7);
  const app = getApp();
  const decoded = await app.auth().verifyIdToken(token);
  return decoded;
}
