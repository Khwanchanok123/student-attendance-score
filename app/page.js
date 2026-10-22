'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, formatDate } from '@/lib/api';
import { visibleSubjects } from '@/lib/roles';
import { subjectPath } from '@/lib/subjects';

// หน้าแรก: เลือกรายวิชา (เฉพาะวิชาที่ผู้ใช้มีสิทธิ์)
export default function HomePage() {
  const [stats, setStats] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/subjects').then(setStats).catch((e) => setError(e.message));
    api('/api/auth/me').then(setUser).catch((e) => setError(e.message));
  }, []);

  const subjects = visibleSubjects(user);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>รายวิชา</h1>
          <div className="muted">เลือกวิชาเพื่อจัดการคาบเรียน รายชื่อนักเรียน และตารางสรุปคะแนน</div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {user && !subjects.length && <div className="card empty">ยังไม่ได้รับสิทธิ์ในวิชาใด — ติดต่อผู้ดูแลระบบ</div>}

      <div className="subject-grid">
        {subjects.map((s) => {
          const st = stats?.[s.slug] || {};
          return (
            <Link key={s.slug} href={subjectPath(s)} className="subject-card">
              <div className="subject-card-icon" aria-hidden="true">{s.icon}</div>
              <div className="subject-card-name">{s.name}</div>
              <div className="muted small">
                {stats ? `${st.sessions || 0} คาบ · ${st.students || 0} นักเรียน` : 'กำลังโหลด...'}
              </div>
              {st.last_date && <div className="muted small">คาบล่าสุด {formatDate(st.last_date)}</div>}
            </Link>
          );
        })}
      </div>
    </>
  );
}
