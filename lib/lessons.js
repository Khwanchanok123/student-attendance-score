// บทเรียนของคลาสหลัก — ถ้านักเรียนเรียนบทเดิมซ้ำ จะนับเฉพาะครั้งที่ได้คะแนนสูงสุด
export const LESSONS = [
  { id: 0, name: 'บทนำ' },
  { id: 1, name: 'บท 1 อ่านใบชา' },
  { id: 2, name: 'บท 2 ไพ่พยากรณ์' },
  { id: 3, name: 'บท 3 ลูกแก้วนิมิต' },
  { id: 4, name: 'บท 4 คาถาทำสำเนา' },
];

export const lessonName = (id) => LESSONS.find((l) => l.id === id)?.name ?? null;

// เงื่อนไขก่อนเรียน: บท 4 ต้องผ่านอย่างน้อย 2 บท (ไม่ซ้ำบท) จากบท 1–3
// "ผ่านบท" = มีอย่างน้อย 1 ครั้งที่ปิดคลาสแล้ว เช็คชื่อ และคะแนนในคาบถึงเกณฑ์ (PASS_SCORE)
export const PREREQUISITES = {
  4: { from: [1, 2, 3], need: 2 },
};

// passedLessons = รายการ id บทที่ผ่านแล้ว → null ถ้าบทนี้ไม่มีเงื่อนไข
export function lessonEligibility(lesson, passedLessons = []) {
  const rule = PREREQUISITES[lesson];
  if (!rule) return null;
  const count = rule.from.filter((id) => passedLessons.includes(id)).length;
  return { ok: count >= rule.need, count, need: rule.need, from: rule.from };
}

const fromText = (from) => from.map((id) => `บท ${id}`).join(', ');

// สถานะของนักเรียน เช่น "ผ่าน 1/2 บท จาก บท 1, บท 2, บท 3"
export const prerequisiteText = (e) => `ผ่าน ${e.count}/${e.need} บท จาก ${fromText(e.from)}`;

// เงื่อนไขของบท เช่น "ต้องผ่านอย่างน้อย 2 บท (ไม่ซ้ำบท) จาก บท 1, บท 2, บท 3"
export function requirementText(lesson) {
  const rule = PREREQUISITES[lesson];
  return rule ? `ต้องผ่านอย่างน้อย ${rule.need} บท (ไม่ซ้ำบท) จาก ${fromText(rule.from)}` : '';
}

// รับค่าจากฟอร์ม: '' / null = ไม่ใช่คลาสหลัก
export function parseLesson(value) {
  if (value === '' || value === null || value === undefined) return null;
  const id = Number(value);
  return LESSONS.some((l) => l.id === id) ? id : undefined;
}
