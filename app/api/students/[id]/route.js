import { db } from '@/lib/db';
import { requireSubjectAccess, requireUser } from '@/lib/auth';
import { json, route, searchParam } from '@/lib/http';
import { formatClaimCode } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

// ข้อมูลนักเรียนในวิชา + คะแนนรายคาบ + ประวัติการเปลี่ยนแปลงคะแนน: ?subject=divination
export const GET = route(async (req, { params }) => {
  const id = Number((await params).id);
  const { subject } = await requireSubjectAccess(searchParam(req, 'subject'));
  const sql = await db();
  const [[student], sessions, logs] = await Promise.all([
    sql`SELECT s.id, s.name, (t.student_id IS NOT NULL) AS member, s.self_registered, s.claim_code,
        a.username AS account_username, a.created_at AS account_created_at,
        COALESCE(t.enrolled, 0) AS enrolled, COALESCE(t.attended, 0) AS attended,
        COALESCE(t.class_score, 0) AS class_score, COALESCE(t.outside_score, 0) AS outside_score,
        COALESCE(t.total_score, 0) AS total_score
      FROM students s
      LEFT JOIN student_subject_summary t ON t.student_id = s.id AND t.subject = ${subject.slug}
      LEFT JOIN student_accounts a ON a.student_id = s.id
      WHERE s.id = ${id}`,
    sql`SELECT se.id AS session_id, se.title, se.lesson, to_char(se.date, 'YYYY-MM-DD') AS date,
        r.check_in_at, r.extra_score::float AS extra_score
      FROM records r
      JOIN sessions se ON se.id = r.session_id
      WHERE r.student_id = ${id} AND se.subject = ${subject.slug}
      ORDER BY se.date DESC, se.id DESC`,
    sql`SELECT l.id, l.session_id, se.title AS session_title, l.kind, l.delta::float AS delta,
        l.reason, l.user_name, l.created_at
      FROM score_logs l LEFT JOIN sessions se ON se.id = l.session_id
      WHERE l.student_id = ${id} AND l.subject = ${subject.slug}
      ORDER BY l.created_at DESC, l.id DESC LIMIT 500`,
  ]);
  if (!student) return json({ error: 'ไม่พบนักเรียน' }, 404);
  student.claim_code = formatClaimCode(student.claim_code);
  return json({ student, sessions, logs });
});

// แก้ชื่อ (ใช้ร่วมกันทุกวิชา)
export const PATCH = route(async (req, { params }) => {
  const user = await requireUser();
  const id = Number((await params).id);
  const body = await req.json();
  const name = String(body.name || '').trim();
  if (!name) return json({ error: 'กรุณาใส่ชื่อนักเรียน' }, 400);
  const sql = await db();
  // ศาสตราจารย์ประจำวิชาแก้ได้เฉพาะนักเรียนในวิชาของตัวเอง
  if (user.role === 'subject') {
    const [own] = await sql`SELECT 1 FROM subject_students WHERE student_id = ${id} AND subject = ANY(${user.subjects}::text[])`;
    if (!own) return json({ error: 'คุณไม่มีสิทธิ์แก้ไขนักเรียนคนนี้' }, 403);
  }
  const [row] = await sql`UPDATE students SET name = ${name} WHERE id = ${id} RETURNING id, name`;
  if (!row) return json({ error: 'ไม่พบนักเรียน' }, 404);
  return json(row);
});

// นำนักเรียนออกจากวิชา: ?subject=divination — ลบการเช็คชื่อ คะแนน และประวัติของคนนี้ในวิชานี้
// (ข้อมูลในวิชาอื่นยังอยู่ ถ้าไม่ได้อยู่วิชาไหนแล้วและไม่มีบัญชีนักเรียน จะลบนักเรียนคนนี้ออกจากระบบ)
export const DELETE = route(async (req, { params }) => {
  const id = Number((await params).id);
  const { subject } = await requireSubjectAccess(searchParam(req, 'subject'));
  const sql = await db();
  await sql`DELETE FROM records r USING sessions se
    WHERE r.session_id = se.id AND se.subject = ${subject.slug} AND r.student_id = ${id}`;
  await sql`DELETE FROM score_logs WHERE student_id = ${id} AND subject = ${subject.slug}`;
  await sql`DELETE FROM subject_students WHERE student_id = ${id} AND subject = ${subject.slug}`;
  await sql`DELETE FROM students s WHERE s.id = ${id}
    AND NOT EXISTS (SELECT 1 FROM subject_students m WHERE m.student_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM records r WHERE r.student_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM student_accounts a WHERE a.student_id = s.id)`;
  return json({ ok: true });
});
