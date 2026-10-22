import { db } from '@/lib/db';
import { assertAllSubjectsOf, requireUser } from '@/lib/auth';
import { formatClaimCode } from '@/lib/accounts';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

// นักเรียนหนึ่งคนในระบบกลาง: ข้อมูล + บัญชี + คะแนนแยกตามวิชาที่เรียน
export const GET = route(async (req, { params }) => {
  await requireUser();
  const id = Number((await params).id);
  const sql = await db();
  const [[student], subjects] = await Promise.all([
    sql`SELECT s.id, s.name, s.self_registered, s.claim_code, s.created_at,
        a.username AS account_username, a.created_at AS account_created_at
      FROM students s LEFT JOIN student_accounts a ON a.student_id = s.id WHERE s.id = ${id}`,
    sql`SELECT subject, enrolled, attended, class_score, outside_score, total_score
      FROM student_subject_summary WHERE student_id = ${id}`,
  ]);
  if (!student) return json({ error: 'ไม่พบนักเรียน' }, 404);
  student.claim_code = formatClaimCode(student.claim_code);
  return json({ student, subjects });
});

// { action: 'accept' } รับนักเรียนที่สมัครเองเป็นรายชื่อจริง (ไม่ต้องผูกกับรายชื่ออื่น)
export const POST = route(async (req, { params }) => {
  await requireUser();
  const id = Number((await params).id);
  const { action } = await req.json();
  if (action !== 'accept') return json({ error: 'คำสั่งไม่ถูกต้อง' }, 400);
  const sql = await db();
  await sql`UPDATE students SET self_registered = false WHERE id = ${id}`;
  return json({ ok: true });
});

// ลบนักเรียนออกจากระบบทั้งหมด (ทุกวิชา คาบ คะแนน ประวัติ และบัญชี)
// ต้องมีสิทธิ์ทุกวิชาที่นักเรียนคนนี้เรียนอยู่
export const DELETE = route(async (req, { params }) => {
  const user = await requireUser();
  const id = Number((await params).id);
  const sql = await db();
  await assertAllSubjectsOf(sql, user, [id]);
  await sql`DELETE FROM students WHERE id = ${id}`;
  return json({ ok: true });
});
