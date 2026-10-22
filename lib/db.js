import { neon } from '@neondatabase/serverless';
import { PASS_SCORE } from './scoring';
import { LEGACY_SUBJECT, SUBJECTS, getSubject } from './subjects';

// คะแนนจากการเช็คชื่อของแต่ละวิชา เป็น SQL (ค่าคงที่จาก lib/subjects.js)
const CHECK_POINTS_SQL = (() => {
  const cases = SUBJECTS.filter((s) => s.checkPoints)
    .map((s) => `WHEN '${s.slug}' THEN ${Number(s.checkPoints)}`).join(' ');
  return cases ? `(CASE se.subject ${cases} ELSE 0 END)` : '0';
})();

// เก็บการเชื่อมต่อไว้ที่ globalThis เพื่อให้ทุก API route ใช้ตัวเดียวกัน
// (ตอน dev แต่ละ route ถูก bundle แยกกัน ถ้าเก็บในตัวแปรของโมดูล PGlite จะถูกเปิดซ้ำบนโฟลเดอร์เดียวกันแล้วพัง)
const shared = (globalThis.__attendanceDb ??= { sql: null, schemaReady: null });

// รันบนเครื่องโดยไม่มี DATABASE_URL: ใช้ PGlite (Postgres ในตัว) เก็บข้อมูลไว้ที่โฟลเดอร์ .data
async function localSql() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { mkdir } = await import('node:fs/promises');
  await mkdir('./.data', { recursive: true });
  const pg = new PGlite('./.data/pglite');
  try {
    await pg.query('SELECT 1');
  } catch {
    throw new Error('ฐานข้อมูลบนเครื่อง (.data) เสียหาย — หยุดเซิร์ฟเวอร์ ลบโฟลเดอร์ .data แล้วรันใหม่');
  }
  // ปิดฐานข้อมูลให้เรียบร้อยเมื่อหยุดเซิร์ฟเวอร์ (Ctrl+C) เพื่อไม่ให้ไฟล์เสีย
  const close = () => pg.close().catch(() => {}).finally(() => process.exit(0));
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  const sql = async (strings, ...values) => {
    const text = strings.reduce((acc, s, i) => `${acc}$${i}${s}`);
    return (await pg.query(text, values)).rows;
  };
  sql.query = async (text, params = []) => (await pg.query(text, params)).rows;
  return sql;
}

// เก็บเป็น Promise เพื่อให้คำขอที่มาพร้อมกันรอการเชื่อมต่อเดียวกัน ไม่เปิดซ้ำ
function getSql() {
  if (!shared.sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (url) {
      shared.sql = Promise.resolve(neon(url));
    } else if (process.env.NODE_ENV !== 'production') {
      shared.sql = localSql().catch((e) => {
        shared.sql = null;
        throw e;
      });
    } else {
      throw new Error('ยังไม่ได้ตั้งค่า DATABASE_URL (เชื่อมต่อฐานข้อมูล Neon ใน Vercel ก่อน)');
    }
  }
  return shared.sql;
}

// สร้างตารางอัตโนมัติในครั้งแรกที่ใช้งาน
async function ensureSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  // lesson = บทของคลาสหลัก (ดู lib/lessons.js), NULL = คาบทั่วไป
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS lesson INT`;
  // ใครสร้าง/อัปเดตคาบล่าสุด (เก็บชื่อไว้ด้วย เผื่อบัญชีผู้ใช้ถูกลบภายหลัง)
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_by_name TEXT`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_by_name TEXT`;
  // ปิดคลาส: ตัดสินผ่าน/ไม่ผ่านตอนปิด และล็อกการเช็คชื่อ/ให้คะแนนจนกว่าจะเปิดอีกครั้ง (NULL = กำลังเรียน)
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS closed_by_name TEXT`;
  // มีแถวใน records = นักเรียนคนนั้นอยู่ในคาบนั้น
  // extra_score = ผลรวมคะแนนที่เพิ่ม/ลดในคาบ (ทุกครั้งมีบันทึกใน score_logs)
  await sql`CREATE TABLE IF NOT EXISTS records (
    session_id INT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    check_in_at TIMESTAMPTZ,
    check_out_at TIMESTAMPTZ,
    extra_score NUMERIC NOT NULL DEFAULT 0,
    note TEXT,
    PRIMARY KEY (session_id, student_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  // วิชาที่ศาสตราจารย์ประจำวิชา (role = 'subject') เข้าถึงได้ — บทบาทอื่นเห็นทุกวิชา (lib/roles.js)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subjects TEXT[] NOT NULL DEFAULT '{}'`;
  // ---- บัญชีนักเรียน (ดูคะแนนตัวเองได้อย่างเดียว) ----
  // self_registered = นักเรียนสมัครเอง (ไม่ได้ถูกอาจารย์เพิ่ม)
  // claim_code = รหัสผูกบัญชีที่อาจารย์สร้างให้ นักเรียนเอาไปใส่ตอนสมัคร/หลังสมัครเพื่อผูกกับรายชื่อนี้ (ใช้ครั้งเดียว)
  await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS self_registered BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS claim_code TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS students_claim_code_idx ON students (claim_code)`;
  await sql`CREATE TABLE IF NOT EXISTS student_accounts (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  // ประวัติคะแนน:
  // kind = 'adjust'  : ครูเพิ่ม/ลดคะแนนในคาบพร้อมหมายเหตุ (delta = คะแนนในคาบที่เปลี่ยน)
  // kind = 'session' : เปลี่ยนอัตโนมัติ (เช็คเข้า-ออก, นำออกจากคาบ, ลบคาบ)
  // kind = 'manual'  : เพิ่ม/ลดคะแนนนอกคลาส (session_id = NULL) นับรวมในคะแนนรวมโดยตรง
  await sql`CREATE TABLE IF NOT EXISTS score_logs (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    session_id INT REFERENCES sessions(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    delta NUMERIC NOT NULL,
    reason TEXT,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    user_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS score_logs_student_idx ON score_logs (student_id, created_at DESC)`;
  // หมายเหตุสำเร็จรูปของผู้ใช้แต่ละคน (ตั้งค่าได้ที่หน้า /settings)
  await sql`CREATE TABLE IF NOT EXISTS reason_presets (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS reason_presets_user_idx ON reason_presets (user_id, position)`;

  // ---- รายวิชา ----
  // ข้อมูลที่มีอยู่ก่อนแยกวิชาได้วิชา LEGACY_SUBJECT จาก DEFAULT แล้วเอา DEFAULT ออก (แถวใหม่ต้องระบุวิชาเสมอ)
  await sql.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT '${LEGACY_SUBJECT}'`);
  await sql`ALTER TABLE sessions ALTER COLUMN subject DROP DEFAULT`;
  await sql`CREATE INDEX IF NOT EXISTS sessions_subject_idx ON sessions (subject, date DESC)`;
  await sql.query(`ALTER TABLE score_logs ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT '${LEGACY_SUBJECT}'`);
  await sql`ALTER TABLE score_logs ALTER COLUMN subject DROP DEFAULT`;
  await sql`CREATE INDEX IF NOT EXISTS score_logs_subject_idx ON score_logs (subject, student_id)`;
  // นักเรียนที่อยู่ในแต่ละวิชา (คนเดียวอยู่ได้หลายวิชา)
  await sql`CREATE TABLE IF NOT EXISTS subject_students (
    subject TEXT NOT NULL,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (subject, student_id)
  )`;
  await runMigrations(sql);

  await sql`DROP VIEW IF EXISTS student_totals`;
  await sql`DROP VIEW IF EXISTS student_scores`;
  await sql`DROP VIEW IF EXISTS student_summary`;
  // คะแนนของนักเรียนแต่ละคนในแต่ละวิชา = คะแนนจากคลาส + คะแนนนอกคลาส
  // คะแนนจากคลาส: คาบทั่วไปนับทุกคาบ, คลาสหลักนับเฉพาะคะแนนสูงสุดของแต่ละบท
  // (ต้องตรงกับ countedSessionIds ใน lib/scoring.js)
  await sql.query(`CREATE OR REPLACE VIEW student_subject_summary AS
    WITH per AS (
      SELECT se.subject, r.student_id, se.lesson,
        (r.check_in_at IS NOT NULL) AS checked, (se.closed_at IS NOT NULL) AS closed,
        CASE WHEN r.check_in_at IS NOT NULL THEN ${CHECK_POINTS_SQL} ELSE 0 END + r.extra_score AS score
      FROM records r JOIN sessions se ON se.id = r.session_id
    ),
    counted AS (
      SELECT subject, student_id, score FROM per WHERE lesson IS NULL
      UNION ALL
      SELECT subject, student_id, MAX(score) FROM per WHERE lesson IS NOT NULL GROUP BY subject, student_id, lesson
    ),
    agg AS (
      SELECT subject, student_id, SUM(score) AS class_score FROM counted GROUP BY subject, student_id
    ),
    att AS (
      SELECT subject, student_id, COUNT(*) AS enrolled, COUNT(*) FILTER (WHERE checked) AS attended
      FROM per GROUP BY subject, student_id
    ),
    outside AS (
      SELECT subject, student_id, SUM(delta) AS outside_score FROM score_logs WHERE kind = 'manual'
      GROUP BY subject, student_id
    ),
    passed AS (
      SELECT subject, student_id, array_agg(DISTINCT lesson ORDER BY lesson) AS passed_lessons
      FROM per WHERE lesson IS NOT NULL AND closed AND checked AND score >= ${Number(PASS_SCORE)}
      GROUP BY subject, student_id
    )
    SELECT m.subject, m.student_id,
      COALESCE(t.enrolled, 0)::int AS enrolled,
      COALESCE(t.attended, 0)::int AS attended,
      COALESCE(a.class_score, 0)::float AS class_score,
      COALESCE(o.outside_score, 0)::float AS outside_score,
      (COALESCE(a.class_score, 0) + COALESCE(o.outside_score, 0))::float AS total_score,
      COALESCE(p.passed_lessons, '{}'::int[]) AS passed_lessons
    FROM subject_students m
    LEFT JOIN agg a ON a.subject = m.subject AND a.student_id = m.student_id
    LEFT JOIN att t ON t.subject = m.subject AND t.student_id = m.student_id
    LEFT JOIN outside o ON o.subject = m.subject AND o.student_id = m.student_id
    LEFT JOIN passed p ON p.subject = m.subject AND p.student_id = m.student_id`);
}

// การแปลงข้อมูลที่ต้องทำครั้งเดียว (จองชื่อก่อนเพื่อไม่ให้รันซ้ำ ถ้าพังให้ปล่อยชื่อคืนแล้วลองใหม่ครั้งหน้า)
async function runMigrations(sql) {
  await sql`CREATE TABLE IF NOT EXISTS app_migrations (
    name TEXT PRIMARY KEY,
    ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  const once = async (name, fn) => {
    const [claimed] = await sql`INSERT INTO app_migrations (name) VALUES (${name}) ON CONFLICT DO NOTHING RETURNING name`;
    if (!claimed) return;
    try {
      await fn();
    } catch (e) {
      await sql`DELETE FROM app_migrations WHERE name = ${name}`;
      throw e;
    }
  };

  // แยกรายวิชา: นักเรียนที่มีอยู่เดิมทั้งหมดอยู่ในวิชาพยากรณ์ศาสตร์
  // และกติกาใหม่ "เช็คชื่อ = +5" ทำให้คนที่เคยเช็คเข้าแต่ยังไม่เช็คออก (เดิมได้ 0) ได้ 5 — บันทึกประวัติไว้ให้ตรวจสอบได้
  await once('subjects-v1', async () => {
    await sql`INSERT INTO subject_students (subject, student_id)
      SELECT ${LEGACY_SUBJECT}, id FROM students ON CONFLICT DO NOTHING`;
    const points = getSubject(LEGACY_SUBJECT).checkPoints || 0;
    if (points) {
      await sql`INSERT INTO score_logs (student_id, session_id, subject, kind, delta, reason, user_name)
        SELECT r.student_id, r.session_id, ${LEGACY_SUBJECT}, 'session', ${points},
          ${`เช็คชื่อ (ปรับตามกติกาใหม่: เช็คชื่อ = +${points})`}, 'ระบบ'
        FROM records r JOIN sessions se ON se.id = r.session_id
        WHERE se.subject = ${LEGACY_SUBJECT} AND r.check_in_at IS NOT NULL AND r.check_out_at IS NULL`;
    }
  });

  // เพิ่มปุ่มปิดคลาส: คาบที่มีอยู่ก่อนหน้านี้ถือว่าจบแล้ว (ผลผ่าน/ไม่ผ่านเดิมไม่หาย)
  await once('close-v1', async () => {
    await sql`UPDATE sessions SET closed_at = COALESCE(updated_at, created_at), closed_by_name = 'ระบบ'
      WHERE closed_at IS NULL`;
  });
}

// เพิ่มเลขนี้เมื่อแก้โครงสร้างฐานข้อมูล เพื่อให้ ensureSchema รันใหม่โดยไม่ต้องรีสตาร์ทเซิร์ฟเวอร์ตอน dev
const SCHEMA_VERSION = 8;

export async function db() {
  const sql = await getSql();
  if (!shared.schemaReady || shared.schemaVersion !== SCHEMA_VERSION) {
    shared.schemaVersion = SCHEMA_VERSION;
    shared.schemaReady = ensureSchema(sql).catch((e) => {
      shared.schemaReady = null;
      throw e;
    });
  }
  await shared.schemaReady;
  return sql;
}

// หมายเหตุสำเร็จรูปของผู้ใช้ เรียงตามลำดับที่ตั้งไว้
export function listPresets(sql, userId) {
  return sql`SELECT id, text, position FROM reason_presets WHERE user_id = ${userId} ORDER BY position, id`;
}

// บันทึกว่าใครอัปเดตคาบล่าสุดและเมื่อไร (แก้ข้อมูลคาบ, เพิ่ม/นำนักเรียนออก, เช็คชื่อ, เพิ่ม/ลดคะแนน)
export function touchSession(sql, sessionId, user) {
  return sql`UPDATE sessions SET updated_at = now(), updated_by_name = ${user.display_name} WHERE id = ${sessionId}`;
}

// บันทึกประวัติคะแนนหลายรายการในคำสั่งเดียว: entries = [{ studentId, delta, reason }]
export async function logScores(sql, { sessionId, subject, kind, user }, entries) {
  if (!entries.length) return;
  await sql`INSERT INTO score_logs (student_id, session_id, subject, kind, delta, reason, user_id, user_name)
    SELECT sid, ${sessionId}, ${subject}, ${kind}, d, rs, ${user.id}, ${user.display_name}
    FROM unnest(${entries.map((e) => e.studentId)}::int[], ${entries.map((e) => e.delta)}::numeric[],
      ${entries.map((e) => e.reason || null)}::text[]) AS t(sid, d, rs)`;
}

// เพิ่มนักเรียนเข้าวิชา (ถ้าอยู่แล้วไม่ทำอะไร)
export function enrollStudents(sql, subject, studentIds) {
  if (!studentIds.length) return [];
  return sql`INSERT INTO subject_students (subject, student_id)
    SELECT ${subject}, id FROM students WHERE id = ANY(${studentIds}::int[])
    ON CONFLICT DO NOTHING RETURNING student_id`;
}

// หานักเรียนที่ชื่อตรงกัน หรือสร้างใหม่ — คืน id (นักเรียนไม่มีรหัสประจำตัว)
export async function findOrCreateStudent(sql, { name }) {
  const [found] = await sql`SELECT id FROM students WHERE name = ${name} ORDER BY id LIMIT 1`;
  if (found) return found.id;
  const [row] = await sql`INSERT INTO students (name) VALUES (${name}) RETURNING id`;
  return row.id;
}

// ข้อมูลคาบพร้อมวิชา (null ถ้าไม่พบ)
export async function getSessionWithSubject(sql, id) {
  const [session] = await sql`SELECT id, title, subject, closed_at FROM sessions WHERE id = ${id}`;
  return session ? { ...session, subjectInfo: getSubject(session.subject) } : null;
}
