import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

// ข้อมูลนักเรียน + คะแนนรายคาบ + ประวัติการเปลี่ยนแปลงคะแนน
export const GET = route(async (req, { params }) => {
  const id = Number((await params).id);
  const sql = await db();
  const [[student], sessions, logs] = await Promise.all([
    sql`SELECT s.id, s.code, s.name, t.enrolled, t.attended, t.class_score, t.outside_score, t.total_score
      FROM students s JOIN student_summary t ON t.student_id = s.id WHERE s.id = ${id}`,
    sql`SELECT se.id AS session_id, se.title, se.lesson, to_char(se.date, 'YYYY-MM-DD') AS date,
        r.check_in_at, r.check_out_at, r.extra_score::float AS extra_score
      FROM records r
      JOIN sessions se ON se.id = r.session_id
      WHERE r.student_id = ${id}
      ORDER BY se.date DESC, se.id DESC`,
    sql`SELECT l.id, l.session_id, se.title AS session_title, l.kind, l.delta::float AS delta,
        l.reason, l.user_name, l.created_at
      FROM score_logs l LEFT JOIN sessions se ON se.id = l.session_id
      WHERE l.student_id = ${id}
      ORDER BY l.created_at DESC, l.id DESC LIMIT 500`,
  ]);
  if (!student) return json({ error: 'ไม่พบนักเรียน' }, 404);
  return json({ student, sessions, logs });
});

export const PATCH = route(async (req, { params }) => {
  await requireUser();
  const id = Number((await params).id);
  const body = await req.json();
  const name = String(body.name || '').trim();
  if (!name) return json({ error: 'กรุณาใส่ชื่อนักเรียน' }, 400);
  const code = String(body.code || '').trim() || null;
  const sql = await db();
  const [row] = await sql`UPDATE students SET code = ${code}, name = ${name} WHERE id = ${id} RETURNING id, code, name`;
  if (!row) return json({ error: 'ไม่พบนักเรียน' }, 404);
  return json(row);
});

export const DELETE = route(async (req, { params }) => {
  await requireUser();
  const id = Number((await params).id);
  const sql = await db();
  await sql`DELETE FROM students WHERE id = ${id}`;
  return json({ ok: true });
});
