import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

// รายชื่อแบบแบ่งหน้า + ค้นหา พร้อมคะแนนรวมทุกคาบ: ?page=1&pageSize=20&q=
export const GET = route(async (req) => {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 20));
  const page = Math.max(1, Math.floor(Number(searchParams.get('page')) || 1));
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

  const sql = await db();
  const [[{ count }], items] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM students s
      WHERE s.name ILIKE ${like} OR COALESCE(s.code, '') ILIKE ${like}`,
    sql`SELECT s.id, s.code, s.name, t.enrolled, t.attended, t.class_score, t.outside_score, t.total_score, t.passed_lessons
      FROM students s JOIN student_summary t ON t.student_id = s.id
      WHERE s.name ILIKE ${like} OR COALESCE(s.code, '') ILIKE ${like}
      ORDER BY length(s.code) NULLS LAST, s.code, s.name
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
  ]);
  return json({ items, total: count, page, pageSize });
});

// รับได้ทั้ง { code, name } หรือ { students: [{ code, name }, ...] }
export const POST = route(async (req) => {
  await requireUser();
  const body = await req.json();
  const list = (Array.isArray(body.students) ? body.students : [body])
    .map((s) => ({ code: String(s.code || '').trim() || null, name: String(s.name || '').trim() }))
    .filter((s) => s.name);
  if (!list.length) return json({ error: 'กรุณาใส่ชื่อนักเรียน' }, 400);

  const sql = await db();
  const created = [];
  for (const s of list) {
    const [row] = await sql`INSERT INTO students (code, name) VALUES (${s.code}, ${s.name}) RETURNING id, code, name`;
    created.push(row);
  }
  return json(created, 201);
});
