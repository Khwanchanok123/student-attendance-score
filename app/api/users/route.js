import { db } from '@/lib/db';
import { hashPassword, requireAdmin, validateNewUser } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { parseAccess } from '@/lib/roles';
import { usernameTaken } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireAdmin();
  const sql = await db();
  const rows = await sql`SELECT id, username, display_name, role, subjects, created_at FROM users ORDER BY id`;
  return json(rows);
});

// { username, display_name, password, role: 'admin' | 'teacher' | 'subject', subjects?: ['divination'] }
export const POST = route(async (req) => {
  await requireAdmin();
  const body = await req.json();
  const access = parseAccess(body);
  if (access.error) return json({ error: access.error }, 400);
  const user = {
    username: String(body.username || '').trim().toLowerCase(),
    display_name: String(body.display_name || '').trim(),
    password: String(body.password || ''),
  };
  const invalid = validateNewUser(user);
  if (invalid) return json({ error: invalid }, 400);

  const sql = await db();
  if (await usernameTaken(sql, user.username)) return json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' }, 409);
  const [row] = await sql`INSERT INTO users (username, display_name, password_hash, role, subjects)
    VALUES (${user.username}, ${user.display_name}, ${hashPassword(user.password)}, ${access.role}, ${access.subjects}::text[])
    RETURNING id, username, display_name, role, subjects, created_at`;
  return json(row, 201);
});
