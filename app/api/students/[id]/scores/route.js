import { db, logScores } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

// คะแนนนอกคลาส + ประวัติของนักเรียนคนนี้
export const GET = route(async (req, { params }) => {
  const id = Number((await params).id);
  const sql = await db();
  const [[summary], logs] = await Promise.all([
    sql`SELECT class_score, outside_score, total_score FROM student_summary WHERE student_id = ${id}`,
    sql`SELECT id, kind, delta::float AS delta, reason, user_name, created_at
      FROM score_logs WHERE student_id = ${id} AND kind = 'manual'
      ORDER BY created_at DESC, id DESC`,
  ]);
  if (!summary) return json({ error: 'ไม่พบนักเรียน' }, 404);
  return json({ ...summary, logs });
});

// เพิ่ม/ลดคะแนนนอกคลาส: { delta: 3 | -2, reason }
export const POST = route(async (req, { params }) => {
  const user = await requireUser();
  const id = Number((await params).id);
  const body = await req.json();
  const delta = Number(body.delta);
  const reason = String(body.reason || '').trim();
  if (!Number.isFinite(delta) || delta === 0) return json({ error: 'กรุณาใส่จำนวนคะแนนที่ไม่ใช่ 0' }, 400);
  if (!reason) return json({ error: 'กรุณาเลือกหรือพิมพ์หมายเหตุ' }, 400);

  const sql = await db();
  const [student] = await sql`SELECT id FROM students WHERE id = ${id}`;
  if (!student) return json({ error: 'ไม่พบนักเรียน' }, 404);
  await logScores(sql, { sessionId: null, kind: 'manual', user }, [{ studentId: id, delta, reason }]);
  return json({ ok: true }, 201);
});
