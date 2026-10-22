import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { db, getSessionWithSubject } from './db';
import { HttpError, json, requireSubject } from './http';
import { canAccessSubject } from './roles';
import { getSubject } from './subjects';
import { COOKIE, SESSION_DAYS, signSession, verifySession } from './session';

// ตอบกลับพร้อมตั้งคุกกี้ล็อกอิน — kind: 'user' (อาจารย์) หรือ 'student' (user = แถวจาก student_accounts)
export async function loginResponse(user, kind = 'user') {
  const res = json(kind === 'student'
    ? { kind, id: user.id, username: user.username }
    : { kind, id: user.id, username: user.username, display_name: user.display_name, role: user.role });
  res.cookies.set(COOKIE, await signSession(user.id, kind), {
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

async function sessionPayload() {
  const token = (await cookies()).get(COOKIE)?.value;
  return (token && (await verifySession(token))) || null;
}

// อาจารย์ที่ล็อกอินอยู่ (บัญชีนักเรียนได้ null เสมอ → API ของอาจารย์ตอบ 401)
export async function currentUser() {
  const payload = await sessionPayload();
  if (payload?.kind !== 'user') return null;
  const sql = await db();
  const [user] = await sql`SELECT id, username, display_name, role, subjects FROM users WHERE id = ${payload.id}`;
  return user || null;
}

// นักเรียนที่ล็อกอินอยู่: { id (บัญชี), username, student_id, name, code }
export async function currentStudent() {
  const payload = await sessionPayload();
  if (payload?.kind !== 'student') return null;
  const sql = await db();
  const [account] = await sql`SELECT a.id, a.username, a.student_id, s.name
    FROM student_accounts a JOIN students s ON s.id = a.student_id WHERE a.id = ${payload.id}`;
  return account || null;
}

export async function requireStudent() {
  const student = await currentStudent();
  if (!student) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
  return student;
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

// ต้องล็อกอินและมีสิทธิ์ในวิชานี้ (ศาสตราจารย์ประจำวิชาเห็นเฉพาะวิชาของตัวเอง)
export function assertSubjectAccess(user, slug) {
  if (!canAccessSubject(user, slug)) throw new HttpError(403, 'คุณไม่มีสิทธิ์เข้าถึงวิชานี้');
}

export async function requireSubjectAccess(slug) {
  const user = await requireUser();
  const subject = requireSubject(slug);
  assertSubjectAccess(user, subject.slug);
  return { user, subject };
}

// งานที่กระทบข้อมูลของนักเรียนทุกวิชา (รวมซ้ำ / ลบออกจากระบบ): ต้องมีสิทธิ์ทุกวิชาที่นักเรียนเหล่านี้เรียนอยู่
export async function assertAllSubjectsOf(sql, user, studentIds) {
  const rows = await sql`SELECT DISTINCT subject FROM subject_students WHERE student_id = ANY(${studentIds}::int[])`;
  const denied = rows.map((r) => r.subject).filter((s) => !canAccessSubject(user, s));
  if (denied.length) {
    const names = denied.map((s) => getSubject(s)?.name || s).join(', ');
    throw new HttpError(403, `ต้องมีสิทธิ์ใน${names} ด้วย — ให้ผู้ดูแลระบบเป็นคนทำ`);
  }
}

// คาบเรียน + ตรวจสิทธิ์ในวิชาของคาบนั้น
// open: true = ใช้กับการแก้ไขในคาบ (เช็คชื่อ/คะแนน/นักเรียน) — คาบที่ปิดคลาสแล้วตอบ 409
export async function requireSessionAccess(sql, sessionId, { open = false } = {}) {
  const user = await requireUser();
  const session = await getSessionWithSubject(sql, sessionId);
  if (!session) throw new HttpError(404, 'ไม่พบคาบเรียนนี้');
  assertSubjectAccess(user, session.subject);
  if (open && session.closed_at) throw new HttpError(409, 'คาบนี้ปิดคลาสแล้ว — กด "เปิดคลาสอีกครั้ง" ก่อนแก้ไข');
  return { user, session };
}

export function validateNewUser({ username, display_name, password }) {
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) return 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ/ตัวเลข 3-32 ตัว';
  if (!display_name) return 'กรุณาใส่ชื่อที่แสดง';
  if (!password || password.length < 6) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว';
  return null;
}

export function validatePassword(password) {
  return !password || password.length < 6 ? 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว' : null;
}
