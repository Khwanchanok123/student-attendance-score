// โทเคนล็อกอินแบบลงลายเซ็น HMAC เก็บในคุกกี้ (ใช้ได้ทั้งใน middleware และ API)
export const COOKIE = 'att_session';
export const SESSION_DAYS = 7;

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64url(bytes) {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function getKey() {
  const secret = process.env.AUTH_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL
    || (process.env.NODE_ENV !== 'production' ? 'local-dev-secret' : '');
  if (!secret) throw new Error('ยังไม่ได้ตั้งค่า AUTH_SECRET');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

// kind: 'user' = อาจารย์ (ตาราง users), 'student' = บัญชีนักเรียน (ตาราง student_accounts)
export async function signSession(id, kind = 'user') {
  const payload = { id, ...(kind === 'student' && { k: 's' }), exp: Date.now() + SESSION_DAYS * 24 * 3600 * 1000 };
  const body = toB64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await getKey(), enc.encode(body));
  return `${body}.${toB64url(new Uint8Array(sig))}`;
}

export async function verifySession(token) {
  try {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const ok = await crypto.subtle.verify('HMAC', await getKey(), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(fromB64url(body)));
    if (!(payload.exp > Date.now())) return null;
    return { ...payload, kind: payload.k === 's' ? 'student' : 'user' };
  } catch {
    return null;
  }
}
