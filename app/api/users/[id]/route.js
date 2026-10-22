import { db } from '@/lib/db';
import { hashPassword, requireAdmin } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { parseAccess } from '@/lib/roles';

// แก้ชื่อที่แสดง / สิทธิ์ / ตั้งรหัสผ่านใหม่
export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  const body = await req.json();
  const sql = await db();

  if ('display_name' in body) {
    const name = String(body.display_name || '').trim();
    if (!name) return json({ error: 'กรุณาใส่ชื่อที่แสดง' }, 400);
    await sql`UPDATE users SET display_name = ${name} WHERE id = ${id}`;
  }
  // บทบาท + วิชาที่เห็นได้: { role, subjects }
  if ('role' in body) {
    if (id === admin.id) return json({ error: 'เปลี่ยนสิทธิ์ของตัวเองไม่ได้' }, 400);
    const access = parseAccess(body);
    if (access.error) return json({ error: access.error }, 400);
    await sql`UPDATE users SET role = ${access.role}, subjects = ${access.subjects}::text[] WHERE id = ${id}`;
  }
  if ('password' in body) {
    const password = String(body.password || '');
    if (password.length < 6) return json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว' }, 400);
    await sql`UPDATE users SET password_hash = ${hashPassword(password)} WHERE id = ${id}`;
  }

  const [row] = await sql`SELECT id, username, display_name, role, subjects, created_at FROM users WHERE id = ${id}`;
  if (!row) return json({ error: 'ไม่พบผู้ใช้' }, 404);
  return json(row);
});

export const DELETE = route(async (req, { params }) => {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  if (id === admin.id) return json({ error: 'ลบบัญชีของตัวเองไม่ได้' }, 400);
  const sql = await db();
  await sql`DELETE FROM users WHERE id = ${id}`;
  return json({ ok: true });
});
