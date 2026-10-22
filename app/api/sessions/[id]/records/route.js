import { db, logScores, touchSession } from '@/lib/db';
import { requireSessionAccess } from '@/lib/auth';
import { json, route } from '@/lib/http';

const selectRecord = (sql, sid, stu) => sql`
  SELECT student_id, check_in_at, extra_score::float AS extra_score, COALESCE(note, '') AS note
  FROM records WHERE session_id = ${sid} AND student_id = ${stu}`;

// เช็คชื่อ/หมายเหตุทีละคน: { student_id, checked?: true|false, note? }
// วิชาที่มีคะแนนเช็คชื่อ (พยากรณ์ศาสตร์) จะได้ +คะแนนอัตโนมัติเมื่อเช็คชื่อ และถูกหักคืนเมื่อยกเลิก
// (เพิ่ม/ลดคะแนนเองใช้ /api/sessions/[id]/scores)
export const PUT = route(async (req, { params }) => {
  const sid = Number((await params).id);
  const body = await req.json();
  const stu = Number(body.student_id);
  const sql = await db();
  const { user, session } = await requireSessionAccess(sql, sid);
  const [before] = await selectRecord(sql, sid, stu);
  if (!before) return json({ error: 'นักเรียนคนนี้ไม่ได้อยู่ในคาบนี้' }, 404);

  if ('checked' in body) {
    if (body.checked) {
      await sql`UPDATE records SET check_in_at = COALESCE(check_in_at, now()) WHERE session_id = ${sid} AND student_id = ${stu}`;
    } else {
      await sql`UPDATE records SET check_in_at = NULL, check_out_at = NULL WHERE session_id = ${sid} AND student_id = ${stu}`;
    }
  }
  if ('note' in body) {
    await sql`UPDATE records SET note = ${String(body.note || '')} WHERE session_id = ${sid} AND student_id = ${stu}`;
  }

  const [after] = await selectRecord(sql, sid, stu);
  const points = session.subjectInfo?.checkPoints || 0;
  if (points && Boolean(before.check_in_at) !== Boolean(after.check_in_at)) {
    await logScores(sql, { sessionId: sid, subject: session.subject, kind: 'session', user }, [{
      studentId: stu,
      delta: after.check_in_at ? points : -points,
      reason: after.check_in_at ? 'เช็คชื่อ' : 'ยกเลิกการเช็คชื่อ',
    }]);
  }
  await touchSession(sql, sid, user);
  return json(after);
});

// เช็คชื่อทั้งคาบ (เฉพาะนักเรียนในคาบนี้ที่ยังไม่ได้เช็ค): { action: 'check_all' }
export const POST = route(async (req, { params }) => {
  const sid = Number((await params).id);
  const { action } = await req.json();
  if (action !== 'check_all') return json({ error: 'คำสั่งไม่ถูกต้อง' }, 400);
  const sql = await db();
  const { user, session } = await requireSessionAccess(sql, sid);

  const done = await sql`UPDATE records SET check_in_at = now()
    WHERE session_id = ${sid} AND check_in_at IS NULL RETURNING student_id`;
  const points = session.subjectInfo?.checkPoints || 0;
  if (points) {
    await logScores(sql, { sessionId: sid, subject: session.subject, kind: 'session', user }, done.map((r) => ({
      studentId: r.student_id, delta: points, reason: 'เช็คชื่อ (เช็คชื่อทั้งหมด)',
    })));
  }
  await touchSession(sql, sid, user);
  return json({ ok: true, checked: done.length });
});
