import { db, logScores } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { lessonName, parseLesson } from '@/lib/lessons';
import { recordTotal } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

// ข้อมูลคาบ + นักเรียนที่อยู่ในคาบนี้พร้อมสถานะเช็คชื่อ/คะแนน
export const GET = route(async (req, { params }) => {
  const id = Number((await params).id);
  const sql = await db();
  const [session] = await sql`SELECT id, title, lesson, to_char(date, 'YYYY-MM-DD') AS date,
    created_at, created_by_name, updated_at, updated_by_name FROM sessions WHERE id = ${id}`;
  if (!session) return json({ error: 'ไม่พบคาบเรียนนี้' }, 404);
  const rows = await sql`
    SELECT s.id AS student_id, s.code, s.name, r.check_in_at, r.check_out_at,
      r.extra_score::float AS extra_score, COALESCE(r.note, '') AS note, t.passed_lessons
    FROM records r
    JOIN students s ON s.id = r.student_id
    JOIN student_summary t ON t.student_id = s.id
    WHERE r.session_id = ${id}
    ORDER BY length(s.code) NULLS LAST, s.code, s.name`;
  return json({ session, rows });
});

export const PATCH = route(async (req, { params }) => {
  const user = await requireUser();
  const id = Number((await params).id);
  const body = await req.json();
  const lesson = parseLesson(body.lesson);
  if (lesson === undefined) return json({ error: 'บทเรียนไม่ถูกต้อง' }, 400);
  const title = String(body.title || '').trim() || lessonName(lesson) || '';
  const date = String(body.date || '').trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'กรุณาใส่ชื่อคาบและวันที่' }, 400);
  const sql = await db();
  const [row] = await sql`UPDATE sessions SET title = ${title}, date = ${date}, lesson = ${lesson},
      updated_at = now(), updated_by_name = ${user.display_name}
    WHERE id = ${id}
    RETURNING id, title, lesson, to_char(date, 'YYYY-MM-DD') AS date,
      created_at, created_by_name, updated_at, updated_by_name`;
  if (!row) return json({ error: 'ไม่พบคาบเรียนนี้' }, 404);
  return json(row);
});

export const DELETE = route(async (req, { params }) => {
  const user = await requireUser();
  const id = Number((await params).id);
  const sql = await db();
  const [session] = await sql`SELECT title FROM sessions WHERE id = ${id}`;
  if (!session) return json({ ok: true });

  // บันทึกประวัติคะแนนที่หายไปจากการลบคาบ (session_id จะเป็น NULL หลังลบ จึงใส่ชื่อคาบในเหตุผล)
  const records = await sql`SELECT student_id, check_in_at, check_out_at, extra_score::float AS extra_score
    FROM records WHERE session_id = ${id}`;
  await sql`DELETE FROM sessions WHERE id = ${id}`;
  await logScores(sql, { sessionId: null, kind: 'session', user }, records
    .filter((r) => recordTotal(r) !== 0)
    .map((r) => ({ studentId: r.student_id, delta: -recordTotal(r), reason: `ลบคาบ "${session.title}"` })));
  return json({ ok: true });
});
