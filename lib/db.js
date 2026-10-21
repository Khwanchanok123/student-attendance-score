import { neon } from '@neondatabase/serverless';
import { ATTENDANCE_POINTS, PASS_SCORE } from './scoring';

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
  await sql`DROP VIEW IF EXISTS student_totals`;
  await sql`DROP VIEW IF EXISTS student_scores`;
  // คะแนนรวมของนักเรียน = คะแนนจากคลาส + คะแนนนอกคลาส
  // คะแนนจากคลาส: คาบทั่วไปนับทุกคาบ, คลาสหลักนับเฉพาะคะแนนสูงสุดของแต่ละบท
  // (ต้องตรงกับ countedSessionIds ใน lib/scoring.js)
  await sql.query(`CREATE OR REPLACE VIEW student_summary AS
    WITH per AS (
      SELECT r.student_id, se.lesson,
        (r.check_in_at IS NOT NULL AND r.check_out_at IS NOT NULL) AS complete,
        CASE WHEN r.check_in_at IS NOT NULL AND r.check_out_at IS NOT NULL THEN ${Number(ATTENDANCE_POINTS)} ELSE 0 END
          + r.extra_score AS score
      FROM records r JOIN sessions se ON se.id = r.session_id
    ),
    counted AS (
      SELECT student_id, score FROM per WHERE lesson IS NULL
      UNION ALL
      SELECT student_id, MAX(score) FROM per WHERE lesson IS NOT NULL GROUP BY student_id, lesson
    ),
    agg AS (
      SELECT student_id, SUM(score) AS class_score FROM counted GROUP BY student_id
    ),
    att AS (
      SELECT student_id, COUNT(*) AS enrolled, COUNT(*) FILTER (WHERE complete) AS attended FROM per GROUP BY student_id
    ),
    outside AS (
      SELECT student_id, SUM(delta) AS outside_score FROM score_logs WHERE kind = 'manual' GROUP BY student_id
    ),
    passed AS (
      SELECT r.student_id, array_agg(DISTINCT se.lesson ORDER BY se.lesson) AS passed_lessons
      FROM records r JOIN sessions se ON se.id = r.session_id
      WHERE se.lesson IS NOT NULL AND r.check_in_at IS NOT NULL AND r.check_out_at IS NOT NULL
        AND ${Number(ATTENDANCE_POINTS)} + r.extra_score >= ${Number(PASS_SCORE)}
      GROUP BY r.student_id
    )
    SELECT s.id AS student_id,
      COALESCE(t.enrolled, 0)::int AS enrolled,
      COALESCE(t.attended, 0)::int AS attended,
      COALESCE(a.class_score, 0)::float AS class_score,
      COALESCE(o.outside_score, 0)::float AS outside_score,
      (COALESCE(a.class_score, 0) + COALESCE(o.outside_score, 0))::float AS total_score,
      COALESCE(p.passed_lessons, '{}'::int[]) AS passed_lessons
    FROM students s
    LEFT JOIN agg a ON a.student_id = s.id
    LEFT JOIN att t ON t.student_id = s.id
    LEFT JOIN outside o ON o.student_id = s.id
    LEFT JOIN passed p ON p.student_id = s.id`);
}

// เพิ่มเลขนี้เมื่อแก้โครงสร้างฐานข้อมูล เพื่อให้ ensureSchema รันใหม่โดยไม่ต้องรีสตาร์ทเซิร์ฟเวอร์ตอน dev
const SCHEMA_VERSION = 4;

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

// บันทึกประวัติคะแนนหลายรายการในคำสั่งเดียว: entries = [{ studentId, delta, reason }]
// หมายเหตุสำเร็จรูปของผู้ใช้ เรียงตามลำดับที่ตั้งไว้
export function listPresets(sql, userId) {
  return sql`SELECT id, text, position FROM reason_presets WHERE user_id = ${userId} ORDER BY position, id`;
}

// บันทึกว่าใครอัปเดตคาบล่าสุดและเมื่อไร (แก้ข้อมูลคาบ, เพิ่ม/นำนักเรียนออก, เช็คชื่อ, เพิ่ม/ลดคะแนน)
export function touchSession(sql, sessionId, user) {
  return sql`UPDATE sessions SET updated_at = now(), updated_by_name = ${user.display_name} WHERE id = ${sessionId}`;
}

export async function logScores(sql, { sessionId, kind, user }, entries) {
  if (!entries.length) return;
  await sql`INSERT INTO score_logs (student_id, session_id, kind, delta, reason, user_id, user_name)
    SELECT sid, ${sessionId}, ${kind}, d, rs, ${user.id}, ${user.display_name}
    FROM unnest(${entries.map((e) => e.studentId)}::int[], ${entries.map((e) => e.delta)}::numeric[],
      ${entries.map((e) => e.reason || null)}::text[]) AS t(sid, d, rs)`;
}
