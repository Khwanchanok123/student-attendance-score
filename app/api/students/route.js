import { db, enrollStudents, findOrCreateStudent } from '@/lib/db';
import { requireSubjectAccess } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

// รายชื่อนักเรียนของวิชา แบบแบ่งหน้า + ค้นหา พร้อมคะแนนในวิชานั้น
// ?subject=divination&page=1&pageSize=20&q=
// &all=1 = ค้นหาจากนักเรียนทุกคนในระบบ (ใช้ตอนเลือกเพิ่มเข้าวิชา/คาบ) — member บอกว่าอยู่ในวิชานี้แล้วหรือยัง
export const GET = route(async (req) => {
  const { searchParams } = new URL(req.url);
  const { subject } = await requireSubjectAccess(searchParams.get('subject'));
  const all = searchParams.get('all') === '1';
  const q = (searchParams.get('q') || '').trim();
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 20));
  const page = Math.max(1, Math.floor(Number(searchParams.get('page')) || 1));
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

  const sql = await db();
  const [[{ count }], items] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM students s
      LEFT JOIN subject_students m ON m.student_id = s.id AND m.subject = ${subject.slug}
      WHERE (${all}::boolean OR m.student_id IS NOT NULL)
        AND s.name ILIKE ${like}`,
    sql`SELECT s.id, s.name, (m.student_id IS NOT NULL) AS member, s.self_registered,
        EXISTS (SELECT 1 FROM student_accounts a WHERE a.student_id = s.id) AS has_account,
        COALESCE(t.enrolled, 0) AS enrolled, COALESCE(t.attended, 0) AS attended,
        COALESCE(t.class_score, 0) AS class_score, COALESCE(t.outside_score, 0) AS outside_score,
        COALESCE(t.total_score, 0) AS total_score, COALESCE(t.passed_lessons, '{}'::int[]) AS passed_lessons
      FROM students s
      LEFT JOIN subject_students m ON m.student_id = s.id AND m.subject = ${subject.slug}
      LEFT JOIN student_subject_summary t ON t.student_id = s.id AND t.subject = ${subject.slug}
      WHERE (${all}::boolean OR m.student_id IS NOT NULL)
        AND s.name ILIKE ${like}
      ORDER BY (m.student_id IS NULL), s.name
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
  ]);
  return json({ items, total: count, page, pageSize });
});

// เพิ่มนักเรียนเข้าวิชา: { subject, student_ids?: [1, 2], students?: [{ name }] }
// students = คนใหม่ (ถ้าชื่อตรงกับคนที่มีอยู่ จะใช้คนเดิม)
export const POST = route(async (req) => {
  const body = await req.json();
  const { subject } = await requireSubjectAccess(body.subject);
  const ids = (Array.isArray(body.student_ids) ? body.student_ids : []).map(Number).filter(Number.isInteger);
  const fresh = (Array.isArray(body.students) ? body.students : [])
    .map((s) => ({ name: String(s.name || '').trim() }))
    .filter((s) => s.name);
  if (!ids.length && !fresh.length) return json({ error: 'กรุณาเลือกหรือใส่ชื่อนักเรียน' }, 400);

  const sql = await db();
  for (const s of fresh) ids.push(await findOrCreateStudent(sql, s));
  const added = await enrollStudents(sql, subject.slug, ids);
  return json({ added: added.length }, 201);
});
