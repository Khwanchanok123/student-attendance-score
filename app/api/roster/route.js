import { db, findOrCreateStudent } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

// เงื่อนไขกรองรายชื่อกลาง
const FILTERS = {
  all: 'TRUE',
  unlinked: 's.self_registered AND a.id IS NOT NULL', // สมัครเองแล้วยังไม่ได้ผูกกับรายชื่อของอาจารย์
  no_subject: 'NOT EXISTS (SELECT 1 FROM subject_students m WHERE m.student_id = s.id)',
  has_account: 'a.id IS NOT NULL',
  no_account: 'a.id IS NULL',
};

// รายชื่อนักเรียนกลาง (ทุกคนในระบบ) พร้อมสถานะบัญชี
// ?q=&page=1&pageSize=20&filter=all|unlinked|no_subject|has_account|no_account
export const GET = route(async (req) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const where = FILTERS[searchParams.get('filter')] || FILTERS.all;
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 20));
  const page = Math.max(1, Math.floor(Number(searchParams.get('page')) || 1));
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const from = `FROM students s LEFT JOIN student_accounts a ON a.student_id = s.id
    WHERE s.name ILIKE $1 AND ${where}`;

  const sql = await db();
  const [[{ count }], items] = await Promise.all([
    sql.query(`SELECT COUNT(*)::int AS count ${from}`, [like]),
    sql.query(`SELECT s.id, s.name, s.self_registered, s.created_at,
        a.username AS account_username
      ${from}
      ORDER BY s.name
      LIMIT $2 OFFSET $3`, [like, pageSize, (page - 1) * pageSize]),
  ]);
  return json({ items, total: count, page, pageSize });
});

// เพิ่มนักเรียนเข้าระบบกลาง (ยังไม่อยู่ในวิชาใด): { students: [{ name }] }
export const POST = route(async (req) => {
  await requireUser();
  const body = await req.json();
  const list = (Array.isArray(body.students) ? body.students : [])
    .map((s) => ({ name: String(s.name || '').trim() }))
    .filter((s) => s.name);
  if (!list.length) return json({ error: 'กรุณาใส่ชื่อนักเรียน' }, 400);
  const sql = await db();
  const ids = [];
  for (const s of list) ids.push(await findOrCreateStudent(sql, s));
  return json({ ids }, 201);
});
