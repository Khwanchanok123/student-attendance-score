import { db } from '@/lib/db';
import { requireSessionAccess } from '@/lib/auth';
import { json, route } from '@/lib/http';

// ปิดคลาส: { } / เปิดคลาสอีกครั้ง: { reopen: true }
// ปิดแล้ว = ตัดสินผ่าน/ไม่ผ่าน และล็อกการเช็คชื่อ ให้คะแนน เพิ่ม/นำนักเรียนออก
export const POST = route(async (req, { params }) => {
  const id = Number((await params).id);
  const { reopen } = await req.json().catch(() => ({}));
  const sql = await db();
  const { user } = await requireSessionAccess(sql, id);
  const [row] = reopen
    ? await sql`UPDATE sessions SET closed_at = NULL, closed_by_name = NULL,
        updated_at = now(), updated_by_name = ${user.display_name}
      WHERE id = ${id} RETURNING closed_at, closed_by_name`
    : await sql`UPDATE sessions SET closed_at = COALESCE(closed_at, now()),
        closed_by_name = COALESCE(closed_by_name, ${user.display_name}),
        updated_at = now(), updated_by_name = ${user.display_name}
      WHERE id = ${id} RETURNING closed_at, closed_by_name`;
  return json(row);
});
