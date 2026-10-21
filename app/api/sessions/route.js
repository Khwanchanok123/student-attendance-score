import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { lessonName, parseLesson } from '@/lib/lessons';
import { ATTENDANCE_POINTS, PASS_SCORE } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const sql = await db();
  const sessions = await sql`
    SELECT se.id, se.title, se.lesson, to_char(se.date, 'YYYY-MM-DD') AS date,
      COUNT(r.student_id)::int AS enrolled,
      COUNT(r.student_id) FILTER (WHERE r.check_in_at IS NOT NULL AND r.check_out_at IS NOT NULL)::int AS complete_count,
      COUNT(r.student_id) FILTER (WHERE r.check_out_at IS NOT NULL AND
        (CASE WHEN r.check_in_at IS NOT NULL THEN ${ATTENDANCE_POINTS}::numeric ELSE 0 END + r.extra_score) < ${PASS_SCORE}
      )::int AS fail_count,
      COALESCE(SUM(
        CASE WHEN r.check_in_at IS NOT NULL AND r.check_out_at IS NOT NULL THEN ${ATTENDANCE_POINTS}::numeric ELSE 0 END
        + r.extra_score
      ), 0)::float AS total_score
    FROM sessions se
    LEFT JOIN records r ON r.session_id = se.id
    GROUP BY se.id
    ORDER BY se.date DESC, se.id DESC`;
  return json({ sessions });
});

export const POST = route(async (req) => {
  await requireUser();
  const body = await req.json();
  const lesson = parseLesson(body.lesson);
  if (lesson === undefined) return json({ error: 'บทเรียนไม่ถูกต้อง' }, 400);
  const title = String(body.title || '').trim() || lessonName(lesson) || '';
  const date = String(body.date || '').trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'กรุณาใส่ชื่อคาบ (หรือเลือกบทเรียน) และวันที่' }, 400);
  const sql = await db();
  const [row] = await sql`INSERT INTO sessions (title, date, lesson) VALUES (${title}, ${date}, ${lesson})
    RETURNING id, title, lesson, to_char(date, 'YYYY-MM-DD') AS date`;
  return json(row, 201);
});
