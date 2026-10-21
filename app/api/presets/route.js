import { db, listPresets } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { PRESET_MAX_LENGTH } from '@/lib/reasons';

export const dynamic = 'force-dynamic';

// หมายเหตุของฉัน (ของผู้ใช้ที่ล็อกอินอยู่)
export const GET = route(async () => {
  const user = await requireUser();
  const sql = await db();
  return json(await listPresets(sql, user.id));
});

// เพิ่มหมายเหตุ: { text }
export const POST = route(async (req) => {
  const user = await requireUser();
  const text = String((await req.json()).text || '').trim();
  if (!text) return json({ error: 'กรุณาพิมพ์หมายเหตุ' }, 400);
  if (text.length > PRESET_MAX_LENGTH) return json({ error: `หมายเหตุยาวเกิน ${PRESET_MAX_LENGTH} ตัวอักษร` }, 400);
  const sql = await db();
  await sql`INSERT INTO reason_presets (user_id, text, position)
    SELECT ${user.id}, ${text}, COALESCE(MAX(position) + 1, 0) FROM reason_presets WHERE user_id = ${user.id}`;
  return json(await listPresets(sql, user.id), 201);
});
