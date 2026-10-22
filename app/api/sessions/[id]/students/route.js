import { db, enrollStudents, findOrCreateStudent, logScores, touchSession } from '@/lib/db';
import { requireSessionAccess } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { recordTotal } from '@/lib/scoring';

// เพิ่มนักเรียนเข้าคาบ: { student_ids: [1, 2] } (คนที่มีอยู่แล้ว) และ/หรือ { new_students: [{ name }] }
// นักเรียนจะถูกเพิ่มเข้าวิชาของคาบนี้ด้วย
export const POST = route(async (req, { params }) => {
  const sid = Number((await params).id);
  const body = await req.json();
  const sql = await db();
  const { user, session } = await requireSessionAccess(sql, sid, { open: true });

  const ids = (Array.isArray(body.student_ids) ? body.student_ids : []).map(Number).filter(Number.isInteger);
  const fresh = (Array.isArray(body.new_students) ? body.new_students : [])
    .map((s) => ({ name: String(s.name || '').trim() }))
    .filter((s) => s.name);
  for (const s of fresh) ids.push(await findOrCreateStudent(sql, s));
  if (!ids.length) return json({ error: 'กรุณาเลือกหรือใส่ชื่อนักเรียน' }, 400);

  await enrollStudents(sql, session.subject, ids);
  const added = await sql`INSERT INTO records (session_id, student_id)
    SELECT ${sid}, id FROM students WHERE id = ANY(${ids}::int[])
    ON CONFLICT DO NOTHING RETURNING student_id`;
  await touchSession(sql, sid, user);
  return json({ added: added.length }, 201);
});

// นำนักเรียนออกจากคาบ: ?student_id=1
export const DELETE = route(async (req, { params }) => {
  const sid = Number((await params).id);
  const stu = Number(new URL(req.url).searchParams.get('student_id'));
  const sql = await db();
  const { user, session } = await requireSessionAccess(sql, sid, { open: true });
  const [rec] = await sql`DELETE FROM records WHERE session_id = ${sid} AND student_id = ${stu}
    RETURNING check_in_at, extra_score::float AS extra_score`;
  const total = rec ? recordTotal(rec, session.subjectInfo) : 0;
  if (total !== 0) {
    await logScores(sql, { sessionId: sid, subject: session.subject, kind: 'session', user }, [{
      studentId: stu, delta: -total, reason: 'นำออกจากคาบ',
    }]);
  }
  if (rec) await touchSession(sql, sid, user);
  return json({ ok: true });
});
