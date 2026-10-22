import { db, enrollStudents, logScores } from '@/lib/db';
import { requireSubjectAccess } from '@/lib/auth';
import { json, route, searchParam } from '@/lib/http';

export const dynamic = 'force-dynamic';

// คะแนนนอกคลาสในวิชา + ประวัติ: ?subject=divination
export const GET = route(async (req, { params }) => {
  const id = Number((await params).id);
  const { subject } = await requireSubjectAccess(searchParam(req, 'subject'));
  const sql = await db();
  const [[summary], logs] = await Promise.all([
    sql`SELECT class_score, outside_score, total_score FROM student_subject_summary
      WHERE student_id = ${id} AND subject = ${subject.slug}`,
    sql`SELECT id, kind, delta::float AS delta, reason, user_name, created_at
      FROM score_logs WHERE student_id = ${id} AND subject = ${subject.slug} AND kind = 'manual'
      ORDER BY created_at DESC, id DESC`,
  ]);
  return json({ class_score: 0, outside_score: 0, total_score: 0, ...summary, logs });
});

// เพิ่ม/ลดคะแนนนอกคลาส: { subject, delta: 3 | -2, reason }
export const POST = route(async (req, { params }) => {
  const id = Number((await params).id);
  const body = await req.json();
  const { user, subject } = await requireSubjectAccess(body.subject);
  const delta = Number(body.delta);
  const reason = String(body.reason || '').trim();
  if (!Number.isFinite(delta) || delta === 0) return json({ error: 'กรุณาใส่จำนวนคะแนนที่ไม่ใช่ 0' }, 400);
  if (!reason) return json({ error: 'กรุณาเลือกหรือพิมพ์หมายเหตุ' }, 400);

  const sql = await db();
  const [student] = await sql`SELECT id FROM students WHERE id = ${id}`;
  if (!student) return json({ error: 'ไม่พบนักเรียน' }, 404);
  await enrollStudents(sql, subject.slug, [id]);
  await logScores(sql, { sessionId: null, subject: subject.slug, kind: 'manual', user }, [{ studentId: id, delta, reason }]);
  return json({ ok: true }, 201);
});
