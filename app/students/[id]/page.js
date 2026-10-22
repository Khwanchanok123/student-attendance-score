'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, formatDelta } from '@/lib/api';
import { canAccessSubject, visibleSubjects } from '@/lib/roles';
import { getSubject, subjectPath } from '@/lib/subjects';
import StudentAccount from '../../student-account';

// นักเรียนหนึ่งคนในระบบกลาง: วิชาที่เรียน + คะแนน, บัญชี, รวมรายชื่อซ้ำ, ลบออกจากระบบ
export default function RosterStudentPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [addTo, setAddTo] = useState('');

  const [me, setMe] = useState(null);

  const load = () => api(`/api/roster/${id}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);
  useEffect(() => { api('/api/auth/me').then(setMe).catch(() => {}); }, []);

  async function run(fn) {
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!data) return error ? <div className="error">{error}</div> : <div className="empty">กำลังโหลด...</div>;
  const { student, subjects } = data;
  // เพิ่มเข้าได้เฉพาะวิชาที่ตัวเองมีสิทธิ์
  const notIn = visibleSubjects(me).filter((s) => !subjects.some((t) => t.subject === s.slug));

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      await api(`/api/students/${id}`, { method: 'PATCH', body: editing });
      setEditing(null);
    });
  };

  const enroll = () => addTo && run(async () => {
    await api('/api/students', { method: 'POST', body: { subject: addTo, student_ids: [student.id] } });
    setAddTo('');
  });

  const removeAll = async () => {
    if (!confirm(`ลบ "${student.name}" ออกจากระบบทั้งหมด?\n\nทุกวิชา คาบเรียน คะแนน ประวัติ และบัญชีนักเรียนจะถูกลบ — ย้อนกลับไม่ได้`)) return;
    try {
      await api(`/api/roster/${id}`, { method: 'DELETE' });
      router.push('/students');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <div className="small"><Link href="/students">← นักเรียนทั้งหมด</Link></div>

      {editing ? (
        <form className="row card" style={{ marginTop: 8 }} onSubmit={save}>
          <input className="grow" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required autoFocus />
          <button className="btn-primary">บันทึก</button>
          <button type="button" onClick={() => setEditing(null)}>ยกเลิก</button>
        </form>
      ) : (
        <div className="page-head" style={{ marginTop: 8 }}>
          <div>
            <h1>{student.name} {student.self_registered && <span className="pill pill-none" style={{ fontSize: '0.8rem' }}>สมัครเอง</span>}</h1>
            <div className="muted">ชื่อใช้ร่วมกันทุกวิชา</div>
          </div>
          <button onClick={() => setEditing({ name: student.name })}>แก้ชื่อ</button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <h2>วิชาที่เรียน</h2>
      <div className="subject-grid" style={{ marginBottom: 12 }}>
        {subjects.length === 0 && <div className="muted">ยังไม่อยู่ในวิชาใด</div>}
        {subjects.map((t) => {
          const s = getSubject(t.subject);
          if (!s) return null;
          const body = (
            <>
              <div className="subject-card-name">{s.icon} {s.name}</div>
              <div className="my-total"><span className="muted small">คะแนนรวม</span> <strong>{t.total_score}</strong></div>
              <div className="muted small">จากคลาส {t.class_score} · นอกคลาส {formatDelta(t.outside_score)}</div>
              <div className="muted small">เข้าเรียน {t.attended}/{t.enrolled} คาบ</div>
            </>
          );
          // วิชาที่ไม่มีสิทธิ์: ดูคะแนนได้แต่กดเข้าไม่ได้
          return canAccessSubject(me, s.slug)
            ? <Link key={t.subject} href={subjectPath(s, `/students/${student.id}`)} className="subject-card">{body}</Link>
            : <div key={t.subject} className="subject-card subject-card-locked" title="ไม่มีสิทธิ์ในวิชานี้">{body}</div>;
        })}
      </div>
      {notIn.length > 0 && (
        <div className="row" style={{ marginBottom: 20 }}>
          <select value={addTo} onChange={(e) => setAddTo(e.target.value)}>
            <option value="">— เพิ่มเข้าวิชา —</option>
            {notIn.map((s) => <option key={s.slug} value={s.slug}>{s.icon} {s.name}</option>)}
          </select>
          <button className="btn-primary" disabled={!addTo} onClick={enroll}>เพิ่ม</button>
        </div>
      )}

      <StudentAccount subject={null} student={student} onChange={load} />

      <div className="card danger-zone">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>ลบออกจากระบบ</strong>
            <div className="muted small">ลบทุกวิชา คาบ คะแนน ประวัติ และบัญชี (ถ้าแค่จะเอาออกจากวิชาเดียว ใช้ปุ่ม "นำออก" ในหน้ารายชื่อของวิชา)</div>
          </div>
          <button className="btn-danger" onClick={removeAll}>ลบนักเรียนคนนี้</button>
        </div>
      </div>
    </>
  );
}
