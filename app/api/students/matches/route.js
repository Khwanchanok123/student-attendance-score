import { db } from '@/lib/db';
import { requireSubjectAccess } from '@/lib/auth';
import { findPendingMatches } from '@/lib/accounts';
import { json, route, searchParam } from '@/lib/http';

export const dynamic = 'force-dynamic';

// นักเรียนที่สมัครเองแล้วชื่อ IC ตรงกับรายชื่อในวิชานี้ (ต่างแค่ตัวพิมพ์ใหญ่/เล็ก) รอให้อาจารย์ผูกรวม: ?subject=
export const GET = route(async (req) => {
  const { subject } = await requireSubjectAccess(searchParam(req, 'subject'));
  const sql = await db();
  return json(await findPendingMatches(sql, subject.slug));
});
