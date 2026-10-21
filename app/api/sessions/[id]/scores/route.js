import { db, logScores } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

// ประวัติคะแนนของนักเรียนในคาบนี้: ?student_id=1
export const GET = route(async (req, { params }) => {
  const sid = Number((await params).id);
  const stu = Number(new URL(req.url).searchParams.get('student_id'));
  const sql = await db();
  const logs = await sql`SELECT id, kind, delta::float AS delta, reason, user_name, created_at
    FROM score_logs WHERE session_id = ${sid} AND student_id = ${stu}
    ORDER BY created_at DESC, id DESC`;
  return json(logs);
});

// เพิ่ม/ลดคะแนนในคาบ: { student_id, delta: 3 | -2, reason }
export const POST = route(async (req, { params }) => {
  const user = await requireUser();
  const sid = Number((await params).id);
  const body = await req.json();
  const stu = Number(body.student_id);
  const delta = Number(body.delta);
  const reason = String(body.reason || '').trim();
  if (!Number.isFinite(delta) || delta === 0) return json({ error: 'กรุณาใส่จำนวนคะแนนที่ไม่ใช่ 0' }, 400);
  if (!reason) return json({ error: 'กรุณาใส่เหตุผล' }, 400);

  const sql = await db();
  const [row] = await sql`UPDATE records SET extra_score = extra_score + ${delta}
    WHERE session_id = ${sid} AND student_id = ${stu}
    RETURNING student_id, check_in_at, check_out_at, extra_score::float AS extra_score, COALESCE(note, '') AS note`;
  if (!row) return json({ error: 'นักเรียนคนนี้ไม่ได้อยู่ในคาบนี้' }, 404);
  await logScores(sql, { sessionId: sid, kind: 'adjust', user }, [{ studentId: stu, delta, reason }]);
  return json(row, 201);
});
