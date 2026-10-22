import { db, logScores, touchSession } from '@/lib/db';
import { requireSessionAccess } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

// ประวัติคะแนนของนักเรียนในคาบนี้: ?student_id=1
export const GET = route(async (req, { params }) => {
  const sid = Number((await params).id);
  const stu = Number(new URL(req.url).searchParams.get('student_id'));
  const sql = await db();
  await requireSessionAccess(sql, sid);
  const logs = await sql`SELECT id, kind, delta::float AS delta, reason, user_name, created_at
    FROM score_logs WHERE session_id = ${sid} AND student_id = ${stu}
    ORDER BY created_at DESC, id DESC`;
  return json(logs);
});

// เพิ่ม/ลดคะแนนในคาบ: { student_id, delta: 3 | -2, reason }
// ทั้งคลาส: { all: true, only_checked?: true, delta, reason } — ให้ทุกคนในคาบ (หรือเฉพาะคนที่เช็คชื่อแล้ว)
export const POST = route(async (req, { params }) => {
  const sid = Number((await params).id);
  const body = await req.json();
  const stu = Number(body.student_id);
  const delta = Number(body.delta);
  const reason = String(body.reason || '').trim();
  if (!Number.isFinite(delta) || delta === 0) return json({ error: 'กรุณาใส่จำนวนคะแนนที่ไม่ใช่ 0' }, 400);
  if (!reason) return json({ error: 'กรุณาใส่เหตุผล' }, 400);

  const sql = await db();
  const { user, session } = await requireSessionAccess(sql, sid);

  if (body.all) {
    const onlyChecked = Boolean(body.only_checked);
    const done = await sql`UPDATE records SET extra_score = extra_score + ${delta}
      WHERE session_id = ${sid} AND (NOT ${onlyChecked}::boolean OR check_in_at IS NOT NULL)
      RETURNING student_id`;
    await logScores(sql, { sessionId: sid, subject: session.subject, kind: 'adjust', user },
      done.map((r) => ({ studentId: r.student_id, delta, reason: reason.includes('ทั้งคลาส') ? reason : `${reason} (ทั้งคลาส)` })));
    if (done.length) await touchSession(sql, sid, user);
    return json({ count: done.length }, 201);
  }

  const [row] = await sql`UPDATE records SET extra_score = extra_score + ${delta}
    WHERE session_id = ${sid} AND student_id = ${stu}
    RETURNING student_id, check_in_at, extra_score::float AS extra_score, COALESCE(note, '') AS note`;
  if (!row) return json({ error: 'นักเรียนคนนี้ไม่ได้อยู่ในคาบนี้' }, 404);
  await logScores(sql, { sessionId: sid, subject: session.subject, kind: 'adjust', user }, [{ studentId: stu, delta, reason }]);
  await touchSession(sql, sid, user);
  return json(row, 201);
});
