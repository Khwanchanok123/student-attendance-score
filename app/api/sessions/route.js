import { db } from '@/lib/db';
import { requireSubjectAccess } from '@/lib/auth';
import { json, route, searchParam } from '@/lib/http';
import { lessonName, parseLesson } from '@/lib/lessons';
import { PASS_SCORE } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

// คาบเรียนของวิชา: ?subject=divination
export const GET = route(async (req) => {
  const { subject } = await requireSubjectAccess(searchParam(req, 'subject'));
  const points = subject.checkPoints || 0;
  const sql = await db();
  const sessions = await sql`
    SELECT se.id, se.title, se.lesson, to_char(se.date, 'YYYY-MM-DD') AS date,
      se.created_at, se.created_by_name, se.updated_at, se.updated_by_name, se.closed_at, se.closed_by_name,
      COUNT(r.student_id)::int AS enrolled,
      COUNT(r.student_id) FILTER (WHERE r.check_in_at IS NOT NULL)::int AS checked_count,
      COUNT(r.student_id) FILTER (WHERE se.closed_at IS NOT NULL AND r.check_in_at IS NOT NULL
        AND ${points}::numeric + r.extra_score < ${PASS_SCORE}
      )::int AS fail_count,
      COALESCE(SUM(CASE WHEN r.check_in_at IS NOT NULL THEN ${points}::numeric ELSE 0 END + r.extra_score), 0)::float
        AS total_score
    FROM sessions se
    LEFT JOIN records r ON r.session_id = se.id
    WHERE se.subject = ${subject.slug}
    GROUP BY se.id
    ORDER BY se.date DESC, se.id DESC`;
  return json({ sessions });
});

// สร้างคาบ: { subject, title, date, lesson? } — lesson ใช้ได้เฉพาะวิชาที่มีคลาสหลัก
export const POST = route(async (req) => {
  const body = await req.json();
  const { user, subject } = await requireSubjectAccess(body.subject);
  const lesson = subject.lessons ? parseLesson(body.lesson) : null;
  if (lesson === undefined) return json({ error: 'บทเรียนไม่ถูกต้อง' }, 400);
  const title = String(body.title || '').trim() || lessonName(lesson) || '';
  const date = String(body.date || '').trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'กรุณาใส่ชื่อคาบและวันที่' }, 400);
  const sql = await db();
  const [row] = await sql`INSERT INTO sessions (subject, title, date, lesson, created_by_name, updated_at, updated_by_name)
    VALUES (${subject.slug}, ${title}, ${date}, ${lesson}, ${user.display_name}, now(), ${user.display_name})
    RETURNING id, subject, title, lesson, to_char(date, 'YYYY-MM-DD') AS date`;
  return json(row, 201);
});
