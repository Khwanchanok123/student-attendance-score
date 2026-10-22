import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { canAccessSubject } from '@/lib/roles';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

// สถิติของแต่ละวิชาสำหรับหน้าแรก: { [slug]: { sessions, students, last_date } } (เฉพาะวิชาที่ผู้ใช้เห็นได้)
export const GET = route(async () => {
  const user = await requireUser();
  const sql = await db();
  const [sessions, students] = await Promise.all([
    sql`SELECT subject, COUNT(*)::int AS sessions, to_char(MAX(date), 'YYYY-MM-DD') AS last_date
      FROM sessions GROUP BY subject`,
    sql`SELECT subject, COUNT(*)::int AS students FROM subject_students GROUP BY subject`,
  ]);
  const stats = {};
  for (const r of sessions) stats[r.subject] = { ...stats[r.subject], sessions: r.sessions, last_date: r.last_date };
  for (const r of students) stats[r.subject] = { ...stats[r.subject], students: r.students };
  for (const slug of Object.keys(stats)) if (!canAccessSubject(user, slug)) delete stats[slug];
  return json(stats);
});
