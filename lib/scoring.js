// เช็คทั้งเข้าและออก = ได้คะแนนเข้าเรียนอัตโนมัติ, เข้าอย่างเดียว = 0
export const ATTENDANCE_POINTS = 5;
// เช็คออกแล้วคะแนนในคาบต่ำกว่านี้ = ไม่ผ่าน
export const PASS_SCORE = 10;

export const isComplete = (r) => Boolean(r?.check_in_at && r?.check_out_at);
export const attendancePoints = (r) => (isComplete(r) ? ATTENDANCE_POINTS : 0);
export const recordTotal = (r) => attendancePoints(r) + Number(r?.extra_score || 0);

// 'pass' | 'fail' | null (ยังไม่เช็คออก)
export function passStatus(r) {
  if (!r?.check_out_at) return null;
  return recordTotal(r) >= PASS_SCORE ? 'pass' : 'fail';
}

export const round2 = (n) => Math.round(n * 100) / 100;

// entries = คาบที่นักเรียนคนหนึ่งลงเรียน [{ session_id, lesson, date, check_in_at, check_out_at, extra_score }]
// คืน Set ของ session_id ที่นับรวมคะแนน: คาบทั่วไปนับทุกคาบ, คลาสหลักนับเฉพาะครั้งที่คะแนนสูงสุดของแต่ละบท
// (เท่ากันให้นับครั้งล่าสุด) — ต้องตรงกับ view student_totals ใน lib/db.js
export function countedSessionIds(entries) {
  const best = new Map();
  const counted = new Set();
  for (const e of entries) {
    if (e.lesson === null || e.lesson === undefined) {
      counted.add(e.session_id);
      continue;
    }
    const cur = best.get(e.lesson);
    const diff = cur ? recordTotal(e) - recordTotal(cur) : 1;
    if (diff > 0 || (diff === 0 && (e.date > cur.date || (e.date === cur.date && e.session_id > cur.session_id)))) {
      best.set(e.lesson, e);
    }
  }
  best.forEach((e) => counted.add(e.session_id));
  return counted;
}
