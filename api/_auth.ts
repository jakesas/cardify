const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let jwksCache: { keys: { kid: string; n: string; e: string; kty: string }[] } | null = null;
let cacheTime = 0;

async function getJwks() {
  if (jwksCache && Date.now() - cacheTime < 3600000) return jwksCache;
  const res = await fetch(JWKS_URL);
  jwksCache = await res.json();
  cacheTime = Date.now();
  return jwksCache;
}

function base64UrlDecode(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

export async function verifyAuth(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) return null;

    return { uid: payload.uid || payload.sub, sub: payload.sub };
  } catch {
    return null;
  }
}
