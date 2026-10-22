// กติกาคะแนนขึ้นกับวิชา (ดู lib/subjects.js)
// - กดเช็คชื่อ: ได้ subject.checkPoints อัตโนมัติ (มีแค่วิชาพยากรณ์ศาสตร์ = 5)
// - ผ่าน/ไม่ผ่าน: เฉพาะวิชาที่มี passRules — เช็คชื่อแล้วคะแนนในคาบต่ำกว่า PASS_SCORE = ไม่ผ่าน
export const PASS_SCORE = 10;

// เช็คชื่อแล้ว (เก็บเวลาไว้ใน check_in_at)
export const isChecked = (r) => Boolean(r?.check_in_at);
export const attendancePoints = (r, subject) => (isChecked(r) ? subject?.checkPoints || 0 : 0);
export const recordTotal = (r, subject) => attendancePoints(r, subject) + Number(r?.extra_score || 0);

// 'pass' | 'fail' | null (วิชานี้ไม่มีผ่าน/ไม่ผ่าน หรือยังไม่เช็คชื่อ)
export function passStatus(r, subject) {
  if (!subject?.passRules || !isChecked(r)) return null;
  return recordTotal(r, subject) >= PASS_SCORE ? 'pass' : 'fail';
}

export const round2 = (n) => Math.round(n * 100) / 100;

// entries = คาบในวิชาหนึ่งที่นักเรียนคนหนึ่งลงเรียน [{ session_id, lesson, date, check_in_at, extra_score }]
// คืน Set ของ session_id ที่นับรวมคะแนน: คาบทั่วไปนับทุกคาบ, คลาสหลักนับเฉพาะครั้งที่คะแนนสูงสุดของแต่ละบท
// (เท่ากันให้นับครั้งล่าสุด) — ต้องตรงกับ view student_subject_summary ใน lib/db.js
export function countedSessionIds(entries, subject) {
  const best = new Map();
  const counted = new Set();
  for (const e of entries) {
    if (e.lesson === null || e.lesson === undefined) {
      counted.add(e.session_id);
      continue;
    }
    const cur = best.get(e.lesson);
    const diff = cur ? recordTotal(e, subject) - recordTotal(cur, subject) : 1;
    if (diff > 0 || (diff === 0 && (e.date > cur.date || (e.date === cur.date && e.session_id > cur.session_id)))) {
      best.set(e.lesson, e);
    }
  }
  best.forEach((e) => counted.add(e.session_id));
  return counted;
}
