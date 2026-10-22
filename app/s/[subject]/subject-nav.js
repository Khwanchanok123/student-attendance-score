'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { getSubject, subjectPath } from '@/lib/subjects';

// วิชาของหน้าปัจจุบัน (จาก URL /s/[subject]/...)
export function useSubject() {
  return getSubject(useParams().subject);
}

export default function SubjectNav({ subject }) {
  const pathname = usePathname();
  const base = subjectPath(subject);
  const tabs = [
    { href: base, label: 'คาบเรียน', active: pathname === base || pathname.startsWith(`${base}/sessions`) },
    { href: `${base}/students`, label: 'รายชื่อนักเรียน', active: pathname.startsWith(`${base}/students`) },
    { href: `${base}/summary`, label: 'ตารางสรุปคะแนน', active: pathname.startsWith(`${base}/summary`) },
  ];

  return (
    <div className="subject-head">
      <div className="subject-title">
        <span className="subject-icon" aria-hidden="true">{subject.icon}</span>
        <div>
          <div className="subject-name">{subject.name}</div>
          {subject.checkPoints > 0 && (
            <div className="muted small">เช็คชื่อ +{subject.checkPoints} อัตโนมัติ · มีคลาสหลัก ผ่าน/ไม่ผ่าน</div>
          )}
        </div>
      </div>
      <nav className="subject-subnav">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={t.active ? 'active' : ''}>{t.label}</Link>
        ))}
      </nav>
    </div>
  );
}
