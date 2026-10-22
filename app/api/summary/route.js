import { db } from '@/lib/db';
import { requireSubjectAccess } from '@/lib/auth';
import { json, route, searchParam } from '@/lib/http';

export const dynamic = 'force-dynamic';

// ข้อมูลตารางสรุปคะแนนของวิชา: ?subject=divination
export const GET = route(async (req) => {
  const { subject } = await requireSubjectAccess(searchParam(req, 'subject'));
  const sql = await db();
  const [students, sessions, records] = await Promise.all([
    sql`SELECT s.id, s.name, t.outside_score
      FROM student_subject_summary t JOIN students s ON s.id = t.student_id
      WHERE t.subject = ${subject.slug}
      ORDER BY s.name`,
    sql`SELECT id, title, lesson, to_char(date, 'YYYY-MM-DD') AS date FROM sessions
      WHERE subject = ${subject.slug} ORDER BY date, id`,
    sql`SELECT r.session_id, r.student_id, r.check_in_at, r.extra_score::float AS extra_score,
        (se.closed_at IS NOT NULL) AS closed
      FROM records r JOIN sessions se ON se.id = r.session_id
      WHERE se.subject = ${subject.slug}`,
  ]);
  return json({ students, sessions, records });
});
