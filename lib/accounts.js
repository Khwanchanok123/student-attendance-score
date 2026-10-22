import { randomInt } from 'node:crypto';
import { HttpError } from './http';
import { SUBJECTS } from './subjects';

// ---- บัญชีนักเรียน + รหัสผูกบัญชี + รวมนักเรียนซ้ำ ----

// ตัดตัวที่สับสนง่ายออก (0/O, 1/I/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// รหัสผูกบัญชีเก็บแบบไม่มีขีด ตัวพิมพ์ใหญ่ — แสดงเป็น ABC-123
export const normalizeClaimCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const formatClaimCode = (code) => (code ? `${code.slice(0, 3)}-${code.slice(3)}` : null);

// สร้าง (หรือสร้างใหม่แทนอันเดิม) รหัสผูกบัญชีให้นักเรียน
export async function issueClaimCode(sql, studentId) {
  for (let i = 0; i < 5; i++) {
    const code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    const [taken] = await sql`SELECT 1 FROM students WHERE claim_code = ${code}`;
    if (taken) continue;
    await sql`UPDATE students SET claim_code = ${code} WHERE id = ${studentId}`;
    return code;
  }
  throw new HttpError(500, 'สร้างรหัสไม่สำเร็จ ลองใหม่อีกครั้ง');
}

// นักเรียนที่รหัสนี้ชี้ไป (ต้องยังไม่มีบัญชี) — ไม่พบตอบ 400
export async function findClaimTarget(sql, rawCode) {
  const code = normalizeClaimCode(rawCode);
  const [target] = code ? await sql`SELECT s.id, s.name FROM students s
    WHERE s.claim_code = ${code} AND NOT EXISTS (SELECT 1 FROM student_accounts a WHERE a.student_id = s.id)` : [];
  if (!target) throw new HttpError(400, 'รหัสผูกบัญชีไม่ถูกต้อง หรือถูกใช้ไปแล้ว — ขอรหัสใหม่จากอาจารย์');
  return target;
}

// ชื่อ IC: ตัดช่องว่างหัวท้ายและช่องว่างซ้อน
export const normalizeName = (name) => String(name || '').trim().replace(/\s+/g, ' ');
// เทียบชื่อแบบไม่สนตัวพิมพ์ใหญ่/เล็กและช่องว่าง
const NAME_SQL = `lower(regexp_replace(trim(%s.name), '[[:space:]]+', ' ', 'g'))`;
const nameExpr = (alias) => NAME_SQL.replace('%s', alias);

// รายชื่อที่อาจารย์เพิ่มไว้ ชื่อสะกดตรงกัน (ไม่สนตัวพิมพ์ใหญ่/เล็ก) และยังไม่มีบัญชี — ผูกอัตโนมัติได้เมื่อเจอคนเดียวเท่านั้น
export async function findExactNameMatch(sql, name) {
  const rows = await sql.query(
    `SELECT s.id, s.name FROM students s
     WHERE NOT s.self_registered AND ${nameExpr('s')} = lower($1)
       AND NOT EXISTS (SELECT 1 FROM student_accounts a WHERE a.student_id = s.id)
     LIMIT 2`,
    [normalizeName(name)],
  );
  return rows.length === 1 ? rows[0] : null;
}

// คู่ที่ชื่อสะกดตรงกันแต่ผูกอัตโนมัติไม่ได้ เช่น นักเรียนสมัครก่อนอาจารย์เพิ่มชื่อ หรือมีชื่อซ้ำหลายคน:
// รายชื่อของอาจารย์ในวิชานี้ที่ยังไม่มีบัญชี กับนักเรียนที่สมัครเองแล้วยังไม่ถูกผูก — ให้อาจารย์กดผูกรวม
export function findPendingMatches(sql, subject) {
  return sql.query(
    `SELECT t.id AS student_id, t.name, s.id AS other_id, s.name AS other_name,
       a.username, a.created_at AS signed_up_at
     FROM students t
     JOIN subject_students m ON m.student_id = t.id AND m.subject = $1
     JOIN students s ON s.self_registered AND s.id <> t.id AND ${nameExpr('s')} = ${nameExpr('t')}
     JOIN student_accounts a ON a.student_id = s.id
     WHERE NOT t.self_registered
       AND NOT EXISTS (SELECT 1 FROM student_accounts x WHERE x.student_id = t.id)
     ORDER BY t.name, a.created_at`,
    [subject],
  );
}

// ชื่อผู้ใช้ห้ามซ้ำทั้งบัญชีอาจารย์และนักเรียน (ใช้หน้าล็อกอินเดียวกัน)
export async function usernameTaken(sql, username) {
  const [row] = await sql`SELECT 1 FROM users WHERE username = ${username}
    UNION ALL SELECT 1 FROM student_accounts WHERE username = ${username}`;
  return Boolean(row);
}

// รวมนักเรียนซ้ำ: ย้ายทุกอย่างของ dropId (คาบ คะแนน ประวัติ วิชา บัญชี) ไปที่ keepId แล้วลบ dropId
// ถ้าอยู่คาบเดียวกันทั้งคู่ จะรวมเป็นแถวเดียว (เช็คชื่อ = เช็คแล้วถ้าคนใดคนหนึ่งเช็ค, คะแนนในคาบบวกกัน)
export async function mergeStudents(sql, keepId, dropId, user) {
  if (keepId === dropId) throw new HttpError(400, 'เลือกนักเรียนคนเดียวกัน');
  const both = await sql`SELECT s.id, s.name, s.self_registered, a.id AS account_id FROM students s
    LEFT JOIN student_accounts a ON a.student_id = s.id WHERE s.id = ANY(${[keepId, dropId]}::int[])`;
  const keep = both.find((s) => s.id === keepId);
  const drop = both.find((s) => s.id === dropId);
  if (!keep || !drop) throw new HttpError(404, 'ไม่พบนักเรียน');
  if (keep.account_id && drop.account_id) throw new HttpError(400, 'ทั้งสองคนมีบัญชีนักเรียนแล้ว รวมกันไม่ได้ — ยกเลิกบัญชีของคนใดคนหนึ่งก่อน');

  // คาบที่ทั้งคู่เช็คชื่อ: คะแนนเช็คชื่อจะเหลือครั้งเดียว บันทึกประวัติการหักคืนไว้
  const doubleChecked = await sql`SELECT k.session_id, se.subject FROM records k
    JOIN records d ON d.session_id = k.session_id AND d.student_id = ${dropId}
    JOIN sessions se ON se.id = k.session_id
    WHERE k.student_id = ${keepId} AND k.check_in_at IS NOT NULL AND d.check_in_at IS NOT NULL`;
  for (const r of doubleChecked) {
    const points = SUBJECTS.find((s) => s.slug === r.subject)?.checkPoints || 0;
    if (!points) continue;
    await sql`INSERT INTO score_logs (student_id, session_id, subject, kind, delta, reason, user_id, user_name)
      VALUES (${dropId}, ${r.session_id}, ${r.subject}, 'session', ${-points}, 'รวมนักเรียนซ้ำ (เช็คชื่อซ้ำในคาบเดียวกัน)',
        ${user?.id ?? null}, ${user?.display_name ?? 'ระบบ'})`;
  }

  await sql`UPDATE records k SET
      check_in_at = LEAST(k.check_in_at, d.check_in_at),
      extra_score = k.extra_score + d.extra_score,
      note = NULLIF(concat_ws(' / ', NULLIF(k.note, ''), NULLIF(d.note, '')), '')
    FROM records d
    WHERE d.session_id = k.session_id AND k.student_id = ${keepId} AND d.student_id = ${dropId}`;
  await sql`DELETE FROM records d USING records k
    WHERE d.session_id = k.session_id AND d.student_id = ${dropId} AND k.student_id = ${keepId}`;
  await sql`UPDATE records SET student_id = ${keepId} WHERE student_id = ${dropId}`;
  await sql`UPDATE score_logs SET student_id = ${keepId} WHERE student_id = ${dropId}`;
  await sql`INSERT INTO subject_students (subject, student_id)
    SELECT subject, ${keepId} FROM subject_students WHERE student_id = ${dropId} ON CONFLICT DO NOTHING`;
  await sql`UPDATE student_accounts SET student_id = ${keepId} WHERE student_id = ${dropId}`;
  await sql`DELETE FROM students WHERE id = ${dropId}`;
  // อาจารย์เคยเพิ่มคนใดคนหนึ่ง = ไม่ใช่ "สมัครเอง" / มีบัญชีแล้วไม่ต้องใช้รหัสผูกอีก
  await sql`UPDATE students SET
      self_registered = self_registered AND ${drop.self_registered},
      claim_code = CASE WHEN EXISTS (SELECT 1 FROM student_accounts WHERE student_id = ${keepId}) THEN NULL ELSE claim_code END
    WHERE id = ${keepId}`;
  return { keep, drop };
}
