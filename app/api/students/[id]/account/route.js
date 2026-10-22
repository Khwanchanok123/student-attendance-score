import { db } from '@/lib/db';
import { hashPassword, requireSubjectAccess, requireUser, validatePassword } from '@/lib/auth';
import { formatClaimCode, issueClaimCode } from '@/lib/accounts';
import { HttpError, json, route, searchParam } from '@/lib/http';

// อาจารย์จัดการบัญชีของนักเรียนในวิชาที่ตัวเองมีสิทธิ์ (ไม่ระบุวิชา = จากหน้ารายชื่อกลาง)
async function access(sql, slug, id) {
  if (!slug) {
    const user = await requireUser();
    const [found] = await sql`SELECT 1 FROM students WHERE id = ${id}`;
    if (!found) throw new HttpError(404, 'ไม่พบนักเรียน');
    return user;
  }
  const { user, subject } = await requireSubjectAccess(slug);
  const [member] = await sql`SELECT 1 FROM subject_students WHERE student_id = ${id} AND subject = ${subject.slug}`;
  if (!member) throw new HttpError(404, 'นักเรียนคนนี้ไม่ได้อยู่ในวิชานี้');
  return user;
}

// { subject, action: 'code' } สร้างรหัสผูกบัญชีใหม่ (อันเดิมใช้ไม่ได้อีก)
// { subject, action: 'password', password } ตั้งรหัสผ่านใหม่ให้นักเรียน
export const POST = route(async (req, { params }) => {
  const id = Number((await params).id);
  const body = await req.json();
  const sql = await db();
  await access(sql, body.subject, id);
  const [account] = await sql`SELECT id FROM student_accounts WHERE student_id = ${id}`;

  if (body.action === 'code') {
    if (account) return json({ error: 'นักเรียนคนนี้มีบัญชีแล้ว' }, 400);
    return json({ claim_code: formatClaimCode(await issueClaimCode(sql, id)) }, 201);
  }
  if (body.action === 'password') {
    if (!account) return json({ error: 'นักเรียนคนนี้ยังไม่มีบัญชี' }, 400);
    const bad = validatePassword(String(body.password || ''));
    if (bad) return json({ error: bad }, 400);
    await sql`UPDATE student_accounts SET password_hash = ${hashPassword(String(body.password))} WHERE id = ${account.id}`;
    return json({ ok: true });
  }
  return json({ error: 'คำสั่งไม่ถูกต้อง' }, 400);
});

// ยกเลิกการผูกบัญชี (ลบบัญชีล็อกอิน คะแนนยังอยู่): ?subject=...
export const DELETE = route(async (req, { params }) => {
  const id = Number((await params).id);
  const sql = await db();
  await access(sql, searchParam(req, 'subject'), id);
  await sql`DELETE FROM student_accounts WHERE student_id = ${id}`;
  return json({ ok: true });
});
