import { db, logScores, touchSession } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { recordTotal } from '@/lib/scoring';

// เพิ่มนักเรียนเข้าคาบ: { student_ids: [1, 2] } (คนที่มีอยู่แล้ว) และ/หรือ { new_students: [{ code, name }] } (สร้างใหม่)
export const POST = route(async (req, { params }) => {
  const user = await requireUser();
  const sid = Number((await params).id);
  const body = await req.json();
  const sql = await db();
  const [session] = await sql`SELECT id FROM sessions WHERE id = ${sid}`;
  if (!session) return json({ error: 'ไม่พบคาบเรียนนี้' }, 404);

  const ids = (Array.isArray(body.student_ids) ? body.student_ids : []).map(Number).filter(Number.isInteger);
  const fresh = (Array.isArray(body.new_students) ? body.new_students : [])
    .map((s) => ({ code: String(s.code || '').trim() || null, name: String(s.name || '').trim() }))
    .filter((s) => s.name);
  for (const s of fresh) {
    const [row] = await sql`INSERT INTO students (code, name) VALUES (${s.code}, ${s.name}) RETURNING id`;
    ids.push(row.id);
  }
  if (!ids.length) return json({ error: 'กรุณาเลือกหรือใส่ชื่อนักเรียน' }, 400);

  const added = await sql`INSERT INTO records (session_id, student_id)
    SELECT ${sid}, id FROM students WHERE id = ANY(${ids}::int[])
    ON CONFLICT DO NOTHING RETURNING student_id`;
  await touchSession(sql, sid, user);
  return json({ added: added.length }, 201);
});

// นำนักเรียนออกจากคาบ: ?student_id=1
export const DELETE = route(async (req, { params }) => {
  const user = await requireUser();
  const sid = Number((await params).id);
  const stu = Number(new URL(req.url).searchParams.get('student_id'));
  const sql = await db();
  const [rec] = await sql`DELETE FROM records WHERE session_id = ${sid} AND student_id = ${stu}
    RETURNING check_in_at, check_out_at, extra_score::float AS extra_score`;
  if (rec && recordTotal(rec) !== 0) {
    await logScores(sql, { sessionId: sid, kind: 'session', user }, [{
      studentId: stu, delta: -recordTotal(rec), reason: 'นำออกจากคาบ',
    }]);
  }
  if (rec) await touchSession(sql, sid, user);
  return json({ ok: true });
});
