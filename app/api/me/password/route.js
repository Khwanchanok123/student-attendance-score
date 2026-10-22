import { db } from '@/lib/db';
import { hashPassword, requireStudent, validatePassword, verifyPassword } from '@/lib/auth';
import { json, route } from '@/lib/http';

// เปลี่ยนรหัสผ่านของนักเรียน: { current, password }
export const POST = route(async (req) => {
  const me = await requireStudent();
  const body = await req.json();
  const password = String(body.password || '');
  const bad = validatePassword(password);
  if (bad) return json({ error: bad }, 400);
  const sql = await db();
  const [account] = await sql`SELECT password_hash FROM student_accounts WHERE id = ${me.id}`;
  if (!verifyPassword(String(body.current || ''), account.password_hash)) return json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' }, 400);
  await sql`UPDATE student_accounts SET password_hash = ${hashPassword(password)} WHERE id = ${me.id}`;
  return json({ ok: true });
});
