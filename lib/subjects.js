// รายวิชา — แต่ละวิชามีคาบเรียน รายชื่อนักเรียน และตารางสรุปคะแนนแยกกัน
// checkPoints : คะแนนที่ได้อัตโนมัติเมื่อกดเช็คชื่อ (0 = ไม่มี)
// lessons     : มีคลาสหลัก 5 บท (lib/lessons.js) + เรียนซ้ำนับคะแนนสูงสุดของบท + เงื่อนไขบท 4
// passRules   : มีแท็กผ่าน/ไม่ผ่าน (คะแนนในคาบต่ำกว่า PASS_SCORE = ไม่ผ่าน)
export const SUBJECTS = [
  { slug: 'flying', name: 'วิชาการบินไม้กวาดและม้า', icon: '🧹' },
  { slug: 'divination', name: 'วิชาพยากรณ์ศาสตร์', icon: '🔮', checkPoints: 5, lessons: true, passRules: true },
  { slug: 'zoology', name: 'วิชาสัตว์วิทยา', icon: '🐉' },
  { slug: 'history', name: 'วิชาประวัติศาสตร์', icon: '📜' },
  { slug: 'potions', name: 'วิชาสมุนไพรและการปรุงยา', icon: '🧪' },
  { slug: 'transfiguration', name: 'วิชาแปลงกาย', icon: '🐈' },
  { slug: 'charms', name: 'วิชาเวทมนตร์คาถา', icon: '🪄' },
  { slug: 'dada', name: 'วิชาป้องกันตัวจากศาสตร์มืด', icon: '🛡️' },
  { slug: 'runes', name: 'วิชาอักษรรูน', icon: '🔣' },
];

// ข้อมูลที่มีอยู่ก่อนแยกรายวิชาเป็นของวิชานี้
export const LEGACY_SUBJECT = 'divination';

export const getSubject = (slug) => SUBJECTS.find((s) => s.slug === slug) || null;

export const subjectPath = (subject, path = '') => `/s/${subject.slug ?? subject}${path}`;

// ชื่อสั้นสำหรับแท็บ (ตัดคำว่า "วิชา" ออก)
export const shortName = (subject) => subject.name.replace(/^วิชา/, '');
