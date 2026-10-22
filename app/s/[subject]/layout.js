import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { canAccessSubject } from '@/lib/roles';
import { getSubject } from '@/lib/subjects';
import SubjectNav from './subject-nav';

// ทุกหน้าในวิชา: หัวข้อวิชา + เมนูย่อย (คาบเรียน / รายชื่อนักเรียน / ตารางสรุปคะแนน)
export default async function SubjectLayout({ children, params }) {
  const subject = getSubject((await params).subject);
  if (!subject) notFound();
  // ศาสตราจารย์ประจำวิชาเข้าได้เฉพาะวิชาของตัวเอง (API ตรวจซ้ำอีกชั้น)
  if (!canAccessSubject(await currentUser(), subject.slug)) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: '2.5rem' }}>🔒</div>
        <h2>คุณไม่มีสิทธิ์เข้าถึง{subject.name}</h2>
        <p className="muted">ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์ในวิชานี้</p>
        <Link href="/" className="btn">กลับไปหน้ารายวิชา</Link>
      </div>
    );
  }
  return (
    <>
      <SubjectNav subject={subject} />
      {children}
    </>
  );
}
