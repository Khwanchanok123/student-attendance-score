import { db } from '@/lib/db';
import { hashPassword, loginResponse, validateNewUser } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

// ยังไม่มีผู้ใช้เลย = ต้องสร้างผู้ดูแลคนแรก
export const GET = route(async () => {
  const sql = await db();
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users`;
  return json({ needsSetup: count === 0 });
});

export const POST = route(async (req) => {
  const body = await req.json();
  const user = {
    username: String(body.username || '').trim().toLowerCase(),
    display_name: String(body.display_name || '').trim(),
    password: String(body.password || ''),
  };
  const invalid = validateNewUser(user);
  if (invalid) return json({ error: invalid }, 400);

  const sql = await db();
  const [created] = await sql`
    INSERT INTO users (username, display_name, password_hash, role)
    SELECT ${user.username}, ${user.display_name}, ${hashPassword(user.password)}, 'admin'
    WHERE NOT EXISTS (SELECT 1 FROM users)
    RETURNING id, username, display_name, role`;
  if (!created) return json({ error: 'ตั้งค่าผู้ดูแลไปแล้ว กรุณาเข้าสู่ระบบ' }, 409);
  return loginResponse(created);
});
