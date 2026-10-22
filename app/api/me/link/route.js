import { db } from '@/lib/db';
import { requireStudent } from '@/lib/auth';
import { findClaimTarget, mergeStudents } from '@/lib/accounts';
import { json, route } from '@/lib/http';

// ผูกบัญชีกับรายชื่อที่อาจารย์เพิ่มไว้: { claim_code }
// ข้อมูลของบัญชีนี้ (ถ้ามี) จะถูกรวมเข้ากับรายชื่อของอาจารย์ — ชื่อที่อาจารย์ใส่ไว้ถือเป็นหลัก
export const POST = route(async (req) => {
  const me = await requireStudent();
  const { claim_code } = await req.json();
  const sql = await db();
  const target = await findClaimTarget(sql, claim_code);
  await mergeStudents(sql, target.id, me.student_id, { id: null, display_name: `นักเรียน (${me.username})` });
  return json({ ok: true, name: target.name });
});
