import { lessonEligibility, lessonName, prerequisiteText, requirementText } from '@/lib/lessons';

// แท็กผลของคาบ: status จาก passStatus() ใน lib/scoring.js
export default function PassTag({ status }) {
  if (status === 'pass') return <span className="pill pill-ok">ผ่าน</span>;
  if (status === 'fail') return <span className="pill pill-fail">ไม่ผ่าน</span>;
  return <span className="muted small">-</span>;
}

// แท็กเตือนเมื่อนักเรียนยังไม่ผ่านเงื่อนไขก่อนเรียนบทนี้ (แสดงเฉพาะบทที่มีเงื่อนไขและยังไม่ผ่าน)
export function PrereqTag({ lesson, passedLessons }) {
  const e = lessonEligibility(lesson, passedLessons);
  if (!e || e.ok) return null;
  return (
    <span className="pill pill-warn" title={`${lessonName(lesson)} ${requirementText(lesson)}`}>
      ⚠ ยังไม่ผ่านเงื่อนไข ({prerequisiteText(e)})
    </span>
  );
}
