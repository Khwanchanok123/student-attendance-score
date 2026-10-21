import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './db';
import { HttpError, json } from './http';
import { COOKIE, SESSION_DAYS, signSession, verifySession } from './session';

// ตอบกลับพร้อมตั้งคุกกี้ล็อกอิน
export async function loginResponse(user) {
  const res = json({ id: user.id, username: user.username, display_name: user.display_name, role: user.role });
  res.cookies.set(COOKIE, await signSession(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600,
  });
  return res;
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  const payload = token && (await verifySession(token));
  if (!payload) return null;
  const sql = await db();
  const [user] = await sql`SELECT id, username, display_name, role FROM users WHERE id = ${payload.id}`;
  return user || null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'admin') throw new HttpError(403, 'เฉพาะผู้ดูแลระบบเท่านั้น');
  return user;
}

export function validateNewUser({ username, display_name, password }) {
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) return 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ/ตัวเลข 3-32 ตัว';
  if (!display_name) return 'กรุณาใส่ชื่อที่แสดง';
  if (!password || password.length < 6) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว';
  return null;
}
