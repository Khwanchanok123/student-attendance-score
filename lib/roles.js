import { SUBJECTS, getSubject } from './subjects';

// บทบาทผู้ใช้ — กำหนดว่าเห็นวิชาไหนได้บ้าง
// admin   : ผู้ดูแลระบบ เห็นทุกวิชา + จัดการผู้ใช้
// teacher : ศาสตราจารย์สอนเสริม เห็นทุกวิชา
// subject : ศาสตราจารย์ประจำวิชา เห็นเฉพาะวิชาที่กำหนดให้ (users.subjects)
export const ROLES = [
  { value: 'subject', label: 'ศาสตราจารย์ประจำวิชา', hint: 'เห็นเฉพาะวิชาที่เลือก', pill: 'pill-lesson' },
  { value: 'teacher', label: 'ศาสตราจารย์สอนเสริม', hint: 'เห็นทุกวิชา', pill: 'pill-none' },
  { value: 'admin', label: 'ผู้ดูแลระบบ', hint: 'เห็นทุกวิชา + จัดการผู้ใช้', pill: 'pill-manual' },
];

export const roleInfo = (role) => ROLES.find((r) => r.value === role) || ROLES[1];

// ตรวจ role + subjects ที่ส่งมา — คืน { role, subjects } หรือ { error }
export function parseAccess(body) {
  const role = ROLES.some((r) => r.value === body.role) ? body.role : 'teacher';
  if (role !== 'subject') return { role, subjects: [] };
  const subjects = [...new Set((Array.isArray(body.subjects) ? body.subjects : []).filter((s) => getSubject(s)))];
  if (!subjects.length) return { error: 'ศาสตราจารย์ประจำวิชาต้องเลือกอย่างน้อย 1 วิชา' };
  return { role, subjects };
}

export const canAccessSubject = (user, slug) =>
  Boolean(user) && (user.role !== 'subject' || (user.subjects || []).includes(slug));

export const visibleSubjects =(user) => SUBJECTS.filter((s) => canAccessSubject(user, s.slug));
