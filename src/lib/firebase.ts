import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  signOut,
  onAuthStateChanged,
  type User,
  type Auth,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!app) throw new Error('Firebase not initialized. Call initFirebase() first.');
  return app;
}

export async function initFirebase(): Promise<Auth> {
  if (!auth) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);
  }
  return auth;
}

export function getFirebaseAuth(): Auth {
  if (!auth) throw new Error('Firebase not initialized. Call initFirebase() first.');
  return auth;
}

export async function loginEmail(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function registerEmail(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function loginGoogle(): Promise<User> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export function loginGoogleRedirect(): void {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  signInWithRedirect(auth, provider);
}

/**
 * Tauri-only Google sign-in. Opens the system browser and captures the OAuth
 * access token via a localhost server. WebView2 blocks the cross-origin auth
 * iframe that popup/redirect rely on, so the system-browser flow is required.
 */
export async function loginGoogleSystemBrowser(): Promise<User> {
  const auth = getFirebaseAuth();
  const [{ start, cancel, onUrl }, { openUrl }] = await Promise.all([
    import('@fabianlars/tauri-plugin-oauth'),
    import('@tauri-apps/plugin-opener'),
  ]);

  return new Promise<User>((resolve, reject) => {
    let port: number | null = null;
    let settled = false;
    let unlisten: (() => void) | null = null;

    const cleanup = () => {
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
      if (port !== null) {
        cancel(port);
        port = null;
      }
    };

    const finish = (err: unknown, user: User | null = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve(user!);
    };

    start()
      .then(async (p) => {
        port = p;
        unlisten = await onUrl((url: string) => {
          const parsed = new URL(url);
          const hashParams = new URLSearchParams(parsed.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          if (!accessToken) {
            finish(new Error('OAuth callback missing access_token: ' + url));
            return;
          }
          const credential = GoogleAuthProvider.credential(null, accessToken);
          signInWithCredential(auth, credential)
            .then((result) => finish(null, result.user))
            .catch((err) => finish(err));
        });

        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        const redirectUri = encodeURIComponent(`http://localhost:${p}`);
        const oauthUrl =
          'https://accounts.google.com/o/oauth2/v2/auth?' +
          `client_id=${encodeURIComponent(clientId)}&` +
          `redirect_uri=${redirectUri}&` +
          'response_type=token&' +
          'scope=' + encodeURIComponent('email profile openid') + '&' +
          'prompt=select_account';

        await openUrl(oauthUrl);
      })
      .catch((err) => finish(err));
  });
}

export async function handleRedirectResult(): Promise<User | null> {
  const auth = getFirebaseAuth();
  try {
    const result = await getRedirectResult(auth);
    return result?.user ?? null;
  } catch (err) {
    return null;
  }
}

export async function logoutUser(): Promise<void> {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}