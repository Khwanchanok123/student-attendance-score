'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, pageNumbers, parseStudentLine } from '@/lib/api';
import { subjectPath } from '@/lib/subjects';
import OutsideScoreDialog from '../../../outside-score-dialog';
import PendingLinks from '../../../pending-links';
import StudentPicker from '../../../student-picker';
import { useSubject } from '../subject-nav';

const PAGE_SIZE = 20;

export default function Page() {
  return (
    <Suspense fallback={<div className="empty">กำลังโหลด...</div>}>
      <StudentsPage />
    </Suspense>
  );
}

function StudentsPage() {
  const subject = useSubject();
  const router = useRouter();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') || '';

  const [data, setData] = useState(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(q);
  const [bulk, setBulk] = useState('');
  const [editing, setEditing] = useState(null);
  const [scoring, setScoring] = useState(null);
  const [saving, setSaving] = useState(false);

  // เก็บหน้า/คำค้นไว้ใน URL เพื่อกดย้อนกลับจากหน้านักเรียนแล้วยังอยู่หน้าเดิม
  function go(nextPage, nextQ = q) {
    const p = new URLSearchParams();
    if (nextQ) p.set('q', nextQ);
    if (nextPage > 1) p.set('page', String(nextPage));
    const qs = p.toString();
    router.replace(`${subjectPath(subject, '/students')}${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== q) go(1, search.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    api(`/api/students?subject=${subject.slug}&page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(q)}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [subject.slug, page, q, reload]);

  async function run(fn) {
    setSaving(true);
    setError('');
    try {
      await fn();
      setReload((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const bulkCount = bulk.split('\n').filter((l) => l.trim()).length;
  const addBulk = () => {
    const list = bulk.split('\n').filter((l) => l.trim()).map(parseStudentLine);
    if (!list.length) return;
    run(async () => {
      await api('/api/students', { method: 'POST', body: { subject: subject.slug, students: list } });
      setBulk('');
    });
  };

  const saveEdit = (e) => {
    e.preventDefault();
    run(async () => {
      await api(`/api/students/${editing.id}`, { method: 'PATCH', body: editing });
      setEditing(null);
    });
  };

  const remove = (s) => {
    if (!confirm(`นำ ${s.name} ออกจาก${subject.name}?\nการเช็คชื่อ คะแนน และประวัติของคนนี้ในวิชานี้จะถูกลบ (ข้อมูลในวิชาอื่นไม่หาย)`)) return;
    run(() => api(`/api/students/${s.id}?subject=${subject.slug}`, { method: 'DELETE' }));
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const firstIndex = data ? (data.page - 1) * data.pageSize : 0;

  return (
    <>
      <div className="muted" style={{ marginBottom: 12 }}>
        {data ? `${q ? 'พบ' : 'ทั้งหมด'} ${data.total} คน` : ' '} · กด ± คะแนน เพื่อเพิ่ม/ลดคะแนนนอกคลาส · กดที่ชื่อเพื่อดูรายละเอียด
      </div>

      {error && <div className="error">{error}</div>}

      <PendingLinks subject={subject} reload={reload} onLinked={() => setReload((n) => n + 1)} />

      <div className="card">
        <h2>เพิ่มนักเรียนเข้าวิชา</h2>
        <StudentPicker
          subject={subject}
          isDisabled={(s) => (s.member ? 'อยู่ในวิชานี้แล้ว' : null)}
          onError={setError}
          onPick={async ({ student, newStudent }) => {
            const body = newStudent
              ? { subject: subject.slug, students: [newStudent] }
              : { subject: subject.slug, student_ids: [student.id] };
            await api('/api/students', { method: 'POST', body });
            setReload((n) => n + 1);
          }}
        />
        <details style={{ marginTop: 12 }}>
          <summary className="small">เพิ่มหลายคนพร้อมกัน</summary>
          <div className="muted small" style={{ margin: '8px 0' }}>
            วางรายชื่อ 1 คนต่อบรรทัด เช่น <code>12345 สมชาย ใจดี</code> หรือแค่ <code>สมชาย ใจดี</code> (คัดลอกจาก Excel ได้)
            — ถ้าชื่อตรงกับนักเรียนที่มีอยู่แล้วในระบบ จะใช้คนเดิม
          </div>
          <textarea rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'1 สมชาย ใจดี\n2 สมหญิง รักเรียน'} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn-primary" onClick={addBulk} disabled={saving || !bulkCount}>
              เพิ่ม {bulkCount || ''} คน
            </button>
          </div>
        </details>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="grow"
          type="search"
          placeholder="🔍 ค้นหาชื่อนักเรียนในวิชานี้..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>ชื่อ</th>
              <th className="num">ลงเรียน (คาบ)</th>
              <th className="num">คะแนนรวม</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!data && !error && <tr><td colSpan={5} className="empty">กำลังโหลด...</td></tr>}
            {data?.items.length === 0 && (
              <tr><td colSpan={5} className="empty">{q ? `ไม่พบนักเรียนที่ตรงกับ "${q}"` : 'ยังไม่มีนักเรียนในวิชานี้ — เพิ่มด้านบนได้เลย'}</td></tr>
            )}
            {data?.items.map((s, i) =>
              editing?.id === s.id ? (
                <tr key={s.id}>
                  <td colSpan={5}>
                    <form className="row" onSubmit={saveEdit}>
                      <input className="grow" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
                      <button className="btn-primary btn-sm" disabled={saving}>บันทึก</button>
                      <button type="button" className="btn-sm" onClick={() => setEditing(null)}>ยกเลิก</button>
                    </form>
                    <div className="muted small" style={{ marginTop: 4 }}>ชื่อใช้ร่วมกันทุกวิชา</div>
                  </td>
                </tr>
              ) : (
                <tr key={s.id}>
                  <td className="num muted">{firstIndex + i + 1}</td>
                  <td><Link href={subjectPath(subject, `/students/${s.id}`)}><strong>{s.name}</strong></Link></td>
                  <td className="num">{s.enrolled}</td>
                  <td className="num"><strong>{s.total_score}</strong></td>
                  <td className="num">
                    <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <button className="btn-sm btn-primary" onClick={() => setScoring(s)}>± คะแนน</button>
                      <Link href={subjectPath(subject, `/students/${s.id}`)} className="btn btn-sm">ดูคะแนน</Link>
                      <button className="btn-sm" onClick={() => setEditing({ id: s.id, name: s.name })}>แก้ไข</button>
                      <button className="btn-sm btn-danger" title="นำออกจากวิชานี้" onClick={() => remove(s)}>นำออก</button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > data.pageSize && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => go(page - 1)}>‹ ก่อนหน้า</button>
          {pageNumbers(page, totalPages).map((n, i) =>
            n === '…' ? (
              <span key={`gap${i}`} className="muted">…</span>
            ) : (
              <button key={n} className={n === page ? 'btn-primary' : ''} onClick={() => go(n)}>{n}</button>
            ),
          )}
          <button disabled={page >= totalPages} onClick={() => go(page + 1)}>ถัดไป ›</button>
        </div>
      )}
      {scoring && (
        <OutsideScoreDialog subject={subject} student={scoring} onSaved={() => setReload((n) => n + 1)} onClose={() => setScoring(null)} />
      )}
    </>
  );
}
