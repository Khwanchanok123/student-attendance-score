import { db } from '@/lib/db';
import { loginResponse, verifyPassword } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const POST = route(async (req) => {
  const body = await req.json();
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const sql = await db();
  const [user] = await sql`SELECT id, username, display_name, role, password_hash FROM users WHERE username = ${username}`;
  if (!user || !verifyPassword(password, user.password_hash)) {
    return json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, 401);
  }
  return loginResponse(user);
});
