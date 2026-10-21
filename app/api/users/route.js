import { db } from '@/lib/db';
import { hashPassword, requireAdmin, validateNewUser } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireAdmin();
  const sql = await db();
  const rows = await sql`SELECT id, username, display_name, role, created_at FROM users ORDER BY id`;
  return json(rows);
});

export const POST = route(async (req) => {
  await requireAdmin();
  const body = await req.json();
  const user = {
    username: String(body.username || '').trim().toLowerCase(),
    display_name: String(body.display_name || '').trim(),
    password: String(body.password || ''),
    role: body.role === 'admin' ? 'admin' : 'teacher',
  };
  const invalid = validateNewUser(user);
  if (invalid) return json({ error: invalid }, 400);

  const sql = await db();
  const [exists] = await sql`SELECT 1 FROM users WHERE username = ${user.username}`;
  if (exists) return json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' }, 409);
  const [row] = await sql`INSERT INTO users (username, display_name, password_hash, role)
    VALUES (${user.username}, ${user.display_name}, ${hashPassword(user.password)}, ${user.role})
    RETURNING id, username, display_name, role, created_at`;
  return json(row, 201);
});
