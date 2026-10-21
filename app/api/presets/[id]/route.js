import { db, listPresets } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { PRESET_MAX_LENGTH } from '@/lib/reasons';

// แก้ข้อความ: { text } หรือเลื่อนลำดับ: { move: 'up' | 'down' } — แก้ได้เฉพาะของตัวเอง
export const PATCH = route(async (req, { params }) => {
  const user = await requireUser();
  const id = Number((await params).id);
  const body = await req.json();
  const sql = await db();
  const [preset] = await sql`SELECT id, position FROM reason_presets WHERE id = ${id} AND user_id = ${user.id}`;
  if (!preset) return json({ error: 'ไม่พบหมายเหตุนี้' }, 404);

  if ('text' in body) {
    const text = String(body.text || '').trim();
    if (!text) return json({ error: 'กรุณาพิมพ์หมายเหตุ' }, 400);
    if (text.length > PRESET_MAX_LENGTH) return json({ error: `หมายเหตุยาวเกิน ${PRESET_MAX_LENGTH} ตัวอักษร` }, 400);
    await sql`UPDATE reason_presets SET text = ${text} WHERE id = ${id}`;
  }

  if (body.move === 'up' || body.move === 'down') {
    // สลับตำแหน่งกับรายการข้างเคียง (จัดลำดับใหม่เป็น 0..n-1 ก่อน กันกรณีตำแหน่งซ้ำ)
    const list = await listPresets(sql, user.id);
    const i = list.findIndex((p) => p.id === id);
    const j = body.move === 'up' ? i - 1 : i + 1;
    if (j >= 0 && j < list.length) {
      [list[i], list[j]] = [list[j], list[i]];
      await sql`UPDATE reason_presets r SET position = x.pos
        FROM unnest(${list.map((p) => p.id)}::int[]) WITH ORDINALITY AS x(pid, pos)
        WHERE r.id = x.pid AND r.user_id = ${user.id}`;
    }
  }

  return json(await listPresets(sql, user.id));
});

export const DELETE = route(async (req, { params }) => {
  const user = await requireUser();
  const id = Number((await params).id);
  const sql = await db();
  await sql`DELETE FROM reason_presets WHERE id = ${id} AND user_id = ${user.id}`;
  return json(await listPresets(sql, user.id));
});
