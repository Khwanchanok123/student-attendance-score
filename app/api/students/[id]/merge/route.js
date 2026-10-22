import { db } from '@/lib/db';
import { assertAllSubjectsOf, requireSubjectAccess, requireUser } from '@/lib/auth';
import { mergeStudents } from '@/lib/accounts';
import { json, route } from '@/lib/http';

// รวมนักเรียนซ้ำ: { subject?, other_id } — ย้ายทุกอย่างของ other_id มาที่นักเรียนคนนี้ แล้วลบ other_id
export const POST = route(async (req, { params }) => {
  const id = Number((await params).id);
  const body = await req.json();
  const otherId = Number(body.other_id);
  // ไม่ระบุวิชา = จากหน้ารายชื่อกลาง
  const user = body.subject ? (await requireSubjectAccess(body.subject)).user : await requireUser();
  const sql = await db();

  // ข้อมูลของทั้งสองคนในทุกวิชาจะถูกย้าย จึงต้องมีสิทธิ์ทุกวิชาที่ทั้งคู่อยู่
  await assertAllSubjectsOf(sql, user, [id, otherId]);
  const { drop } = await mergeStudents(sql, id, otherId, user);
  return json({ ok: true, merged: drop.name });
});
