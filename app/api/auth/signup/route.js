import { db } from '@/lib/db';
import { hashPassword, loginResponse, validatePassword } from '@/lib/auth';
import { findClaimTarget, findExactNameMatch, normalizeName, usernameTaken } from '@/lib/accounts';
import { json, route } from '@/lib/http';

// นักเรียนสมัครเอง: { username, password, name (ชื่อ IC), claim_code? }
// 1. มีรหัสผูกบัญชีจากอาจารย์ → ผูกกับรายชื่อนั้น
// 2. ชื่อ IC สะกดตรงกับรายชื่อที่อาจารย์เพิ่มไว้ (ไม่สนตัวพิมพ์ใหญ่/เล็ก และมีคนเดียว) → ผูกทันที
// 3. ไม่ตรง → สร้างเป็นนักเรียนสมัครเอง ถ้าอาจารย์เพิ่มชื่อนี้ภายหลัง จะเห็นในรายการ "รอผูกบัญชี"
export const POST = route(async (req) => {
  const body = await req.json();
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = normalizeName(body.name);
  const claimCode = String(body.claim_code || '').trim();

  if (!name) return json({ error: 'กรุณาใส่ชื่อ IC' }, 400);
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) return json({ error: 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ/ตัวเลข 3-32 ตัว' }, 400);
  const badPassword = validatePassword(password);
  if (badPassword) return json({ error: badPassword }, 400);

  const sql = await db();
  if (await usernameTaken(sql, username)) return json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' }, 409);

  const target = claimCode ? await findClaimTarget(sql, claimCode) : await findExactNameMatch(sql, name);
  let studentId;
  if (target) {
    studentId = target.id;
    await sql`UPDATE students SET claim_code = NULL WHERE id = ${studentId}`;
  } else {
    const [row] = await sql`INSERT INTO students (name, self_registered) VALUES (${name}, true) RETURNING id`;
    studentId = row.id;
  }
  const [account] = await sql`INSERT INTO student_accounts (student_id, username, password_hash)
    VALUES (${studentId}, ${username}, ${hashPassword(password)}) RETURNING id, username`;
  return loginResponse(account, 'student');
});
