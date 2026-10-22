import { db } from '@/lib/db';
import { requireStudent } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { SUBJECTS } from '@/lib/subjects';

export const dynamic = 'force-dynamic';

// คะแนนของนักเรียนที่ล็อกอินอยู่ แยกตามวิชาที่เรียน (ดูได้อย่างเดียว)
export const GET = route(async () => {
  const me = await requireStudent();
  const sql = await db();
  const [[student], summaries, sessions, logs] = await Promise.all([
    sql`SELECT id, name, self_registered FROM students WHERE id = ${me.student_id}`,
    sql`SELECT t.subject, t.enrolled, t.attended, t.class_score, t.outside_score, t.total_score, t.passed_lessons
      FROM subject_students m
      JOIN student_subject_summary t ON t.student_id = m.student_id AND t.subject = m.subject
      WHERE m.student_id = ${me.student_id}`,
    sql`SELECT se.subject, se.id AS session_id, se.title, se.lesson, to_char(se.date, 'YYYY-MM-DD') AS date,
        r.check_in_at, r.extra_score::float AS extra_score
      FROM records r JOIN sessions se ON se.id = r.session_id
      WHERE r.student_id = ${me.student_id}
      ORDER BY se.date DESC, se.id DESC`,
    sql`SELECT l.id, l.subject, l.session_id, se.title AS session_title, l.kind, l.delta::float AS delta,
        l.reason, l.user_name, l.created_at
      FROM score_logs l LEFT JOIN sessions se ON se.id = l.session_id
      WHERE l.student_id = ${me.student_id}
      ORDER BY l.created_at DESC, l.id DESC LIMIT 500`,
  ]);
  const subjects = SUBJECTS.filter((s) => summaries.some((r) => r.subject === s.slug)).map((s) => ({
    ...summaries.find((r) => r.subject === s.slug),
    sessions: sessions.filter((r) => r.subject === s.slug),
    logs: logs.filter((r) => r.subject === s.slug),
  }));
  return json({ student: { ...student, username: me.username }, subjects });
});
