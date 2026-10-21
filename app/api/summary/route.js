import { db } from '@/lib/db';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const sql = await db();
  const [students, sessions, records] = await Promise.all([
    sql`SELECT s.id, s.code, s.name, t.outside_score
      FROM students s JOIN student_summary t ON t.student_id = s.id
      ORDER BY length(s.code) NULLS LAST, s.code, s.name`,
    sql`SELECT id, title, lesson, to_char(date, 'YYYY-MM-DD') AS date FROM sessions ORDER BY date, id`,
    sql`SELECT session_id, student_id, check_in_at, check_out_at, extra_score::float AS extra_score FROM records`,
  ]);
  return json({ students, sessions, records });
});
