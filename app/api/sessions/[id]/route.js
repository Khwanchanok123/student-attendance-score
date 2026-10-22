import { db, logScores } from '@/lib/db';
import { assertSubjectAccess, requireSessionAccess, requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { lessonName, parseLesson } from '@/lib/lessons';
import { recordTotal } from '@/lib/scoring';
import { getSubject } from '@/lib/subjects';

export const dynamic = 'force-dynamic';

const SESSION_FIELDS = 'id, subject, title, lesson, to_char(date, \'YYYY-MM-DD\') AS date, created_at, created_by_name, updated_at, updated_by_name';

// ข้อมูลคาบ + นักเรียนที่อยู่ในคาบนี้พร้อมสถานะเช็คชื่อ/คะแนน
export const GET = route(async (req, { params }) => {
  const user = await requireUser();
  const id = Number((await params).id);
  const sql = await db();
  const [session] = await sql.query(`SELECT ${SESSION_FIELDS} FROM sessions WHERE id = $1`, [id]);
  if (!session) return json({ error: 'ไม่พบคาบเรียนนี้' }, 404);
  assertSubjectAccess(user, session.subject);
  const rows = await sql`
    SELECT s.id AS student_id, s.name, r.check_in_at,
      r.extra_score::float AS extra_score, COALESCE(r.note, '') AS note,
      COALESCE(t.passed_lessons, '{}'::int[]) AS passed_lessons
    FROM records r
    JOIN students s ON s.id = r.student_id
    LEFT JOIN student_subject_summary t ON t.student_id = s.id AND t.subject = ${session.subject}
    WHERE r.session_id = ${id}
    ORDER BY s.name`;
  return json({ session, rows });
});

// แก้ไขคาบ: { title, date, lesson? } (ย้ายวิชาไม่ได้)
export const PATCH = route(async (req, { params }) => {
  const id = Number((await params).id);
  const body = await req.json();
  const sql = await db();
  const { user, session: current } = await requireSessionAccess(sql, id);
  const subject = current.subjectInfo;

  const lesson = subject?.lessons ? parseLesson(body.lesson) : null;
  if (lesson === undefined) return json({ error: 'บทเรียนไม่ถูกต้อง' }, 400);
  const title = String(body.title || '').trim() || lessonName(lesson) || '';
  const date = String(body.date || '').trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'กรุณาใส่ชื่อคาบและวันที่' }, 400);
  const [row] = await sql.query(
    `UPDATE sessions SET title = $1, date = $2, lesson = $3, updated_at = now(), updated_by_name = $4
     WHERE id = $5 RETURNING ${SESSION_FIELDS}`,
    [title, date, lesson, user.display_name, id],
  );
  return json(row);
});

export const DELETE = route(async (req, { params }) => {
  const id = Number((await params).id);
  const sql = await db();
  const { user, session } = await requireSessionAccess(sql, id);

  // บันทึกประวัติคะแนนที่หายไปจากการลบคาบ (session_id จะเป็น NULL หลังลบ จึงใส่ชื่อคาบในเหตุผล)
  const subject = getSubject(session.subject);
  const records = await sql`SELECT student_id, check_in_at, extra_score::float AS extra_score
    FROM records WHERE session_id = ${id}`;
  await sql`DELETE FROM sessions WHERE id = ${id}`;
  await logScores(sql, { sessionId: null, subject: session.subject, kind: 'session', user }, records
    .filter((r) => recordTotal(r, subject) !== 0)
    .map((r) => ({ studentId: r.student_id, delta: -recordTotal(r, subject), reason: `ลบคาบ "${session.title}"` })));
  return json({ ok: true });
});
