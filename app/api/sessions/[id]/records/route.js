import { db, logScores, touchSession } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { ATTENDANCE_POINTS, isComplete } from '@/lib/scoring';

const selectRecord = (sql, sid, stu) => sql`
  SELECT student_id, check_in_at, check_out_at, extra_score::float AS extra_score, COALESCE(note, '') AS note
  FROM records WHERE session_id = ${sid} AND student_id = ${stu}`;

// เช็คชื่อ/หมายเหตุทีละคน: { student_id, check_in?, check_out?, note? }
// (เพิ่ม/ลดคะแนนใช้ /api/sessions/[id]/scores)
export const PUT = route(async (req, { params }) => {
  const user = await requireUser();
  const sid = Number((await params).id);
  const body = await req.json();
  const stu = Number(body.student_id);
  const sql = await db();

  const [before] = await selectRecord(sql, sid, stu);
  if (!before) return json({ error: 'นักเรียนคนนี้ไม่ได้อยู่ในคาบนี้' }, 404);
  if (body.check_out && !before.check_in_at && !body.check_in) {
    return json({ error: 'ต้องเช็คเข้าก่อนจึงจะเช็คออกได้' }, 400);
  }

  if ('check_in' in body) {
    if (body.check_in) {
      await sql`UPDATE records SET check_in_at = COALESCE(check_in_at, now())
        WHERE session_id = ${sid} AND student_id = ${stu}`;
    } else {
      // ยกเลิกเข้า = ยกเลิกออกด้วย
      await sql`UPDATE records SET check_in_at = NULL, check_out_at = NULL
        WHERE session_id = ${sid} AND student_id = ${stu}`;
    }
  }
  if ('check_out' in body) {
    if (body.check_out) {
      await sql`UPDATE records SET check_out_at = COALESCE(check_out_at, now())
        WHERE session_id = ${sid} AND student_id = ${stu} AND check_in_at IS NOT NULL`;
    } else {
      await sql`UPDATE records SET check_out_at = NULL WHERE session_id = ${sid} AND student_id = ${stu}`;
    }
  }
  if ('note' in body) {
    await sql`UPDATE records SET note = ${String(body.note || '')} WHERE session_id = ${sid} AND student_id = ${stu}`;
  }

  const [after] = await selectRecord(sql, sid, stu);
  if (isComplete(before) !== isComplete(after)) {
    await logScores(sql, { sessionId: sid, kind: 'session', user }, [{
      studentId: stu,
      delta: isComplete(after) ? ATTENDANCE_POINTS : -ATTENDANCE_POINTS,
      reason: isComplete(after) ? 'เช็คเข้า-ออกครบ' : 'ยกเลิกการเช็คเข้า-ออก',
    }]);
  }
  await touchSession(sql, sid, user);
  return json(after);
});

// เช็คทั้งคาบ (เฉพาะนักเรียนในคาบนี้): { action: 'checkin_all' | 'checkout_all' }
export const POST = route(async (req, { params }) => {
  const user = await requireUser();
  const sid = Number((await params).id);
  const { action } = await req.json();
  const sql = await db();

  if (action === 'checkin_all') {
    await sql`UPDATE records SET check_in_at = now() WHERE session_id = ${sid} AND check_in_at IS NULL`;
  } else if (action === 'checkout_all') {
    const done = await sql`UPDATE records SET check_out_at = now()
      WHERE session_id = ${sid} AND check_in_at IS NOT NULL AND check_out_at IS NULL
      RETURNING student_id`;
    await logScores(sql, { sessionId: sid, kind: 'session', user }, done.map((r) => ({
      studentId: r.student_id, delta: ATTENDANCE_POINTS, reason: 'เช็คเข้า-ออกครบ (เช็คออกทั้งหมด)',
    })));
  } else {
    return json({ error: 'คำสั่งไม่ถูกต้อง' }, 400);
  }
  await touchSession(sql, sid, user);
  return json({ ok: true });
});
