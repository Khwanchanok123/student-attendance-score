'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, parseStudentLine } from '@/lib/api';
import OutsideScoreDialog from '../outside-score-dialog';

const PAGE_SIZE = 20;

export default function Page() {
  return (
    <Suspense fallback={<div className="empty">กำลังโหลด...</div>}>
      <StudentsPage />
    </Suspense>
  );
}

function StudentsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') || '';

  const [data, setData] = useState(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(q);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
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
    router.replace(`/students${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== q) go(1, search.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    api(`/api/students?page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(q)}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [page, q, reload]);

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

  const addOne = (e) => {
    e.preventDefault();
    run(async () => {
      await api('/api/students', { method: 'POST', body: { code, name } });
      setCode('');
      setName('');
    });
  };

  const bulkCount = bulk.split('\n').filter((l) => l.trim()).length;
  const addBulk = () => {
    const list = bulk.split('\n').filter((l) => l.trim()).map(parseStudentLine);
    if (!list.length) return;
    run(async () => {
      await api('/api/students', { method: 'POST', body: { students: list } });
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
    if (!confirm(`ลบ ${s.name}? ข้อมูลเช็คชื่อ คะแนน และประวัติของคนนี้จะถูกลบทั้งหมด`)) return;
    run(() => api(`/api/students/${s.id}`, { method: 'DELETE' }));
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const firstIndex = data ? (data.page - 1) * data.pageSize : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>นักเรียน</h1>
          <div className="muted">
            {data ? `${q ? 'พบ' : 'ทั้งหมด'} ${data.total} คน` : ' '} · กด ± คะแนน เพื่อเพิ่ม/ลดคะแนนนอกคลาส · กดที่ชื่อเพื่อดูรายละเอียด
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <details className="card">
        <summary><strong>+ เพิ่มนักเรียน</strong></summary>
        <form className="row" style={{ marginTop: 12 }} onSubmit={addOne}>
          <input placeholder="รหัส / เลขที่ (ไม่บังคับ)" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 180 }} />
          <input className="grow" placeholder="ชื่อ-นามสกุล" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn-primary" disabled={saving}>+ เพิ่ม</button>
        </form>
        <div className="muted small" style={{ margin: '16px 0 8px' }}>
          หรือเพิ่มหลายคนพร้อมกัน: วางรายชื่อ 1 คนต่อบรรทัด เช่น <code>12345 สมชาย ใจดี</code> หรือแค่ <code>สมชาย ใจดี</code> (คัดลอกจาก Excel ได้)
        </div>
        <textarea rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'1 สมชาย ใจดี\n2 สมหญิง รักเรียน'} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn-primary" onClick={addBulk} disabled={saving || !bulkCount}>
            เพิ่ม {bulkCount || ''} คน
          </button>
        </div>
      </details>

      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="grow"
          type="search"
          placeholder="🔍 ค้นหาชื่อหรือรหัสนักเรียน..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>รหัส</th>
              <th>ชื่อ</th>
              <th className="num">ลงเรียน (คาบ)</th>
              <th className="num">คะแนนรวมทุกคลาส</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!data && !error && <tr><td colSpan={6} className="empty">กำลังโหลด...</td></tr>}
            {data?.items.length === 0 && (
              <tr><td colSpan={6} className="empty">{q ? `ไม่พบนักเรียนที่ตรงกับ "${q}"` : 'ยังไม่มีนักเรียน'}</td></tr>
            )}
            {data?.items.map((s, i) =>
              editing?.id === s.id ? (
                <tr key={s.id}>
                  <td colSpan={6}>
                    <form className="row" onSubmit={saveEdit}>
                      <input value={editing.code || ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="รหัส" style={{ width: 140 }} />
                      <input className="grow" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
                      <button className="btn-primary btn-sm" disabled={saving}>บันทึก</button>
                      <button type="button" className="btn-sm" onClick={() => setEditing(null)}>ยกเลิก</button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={s.id}>
                  <td className="num muted">{firstIndex + i + 1}</td>
                  <td className="muted">{s.code || '-'}</td>
                  <td><Link href={`/students/${s.id}`}><strong>{s.name}</strong></Link></td>
                  <td className="num">{s.enrolled}</td>
                  <td className="num"><strong>{s.total_score}</strong></td>
                  <td className="num">
                    <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <button className="btn-sm btn-primary" onClick={() => setScoring(s)}>± คะแนน</button>
                      <Link href={`/students/${s.id}`} className="btn btn-sm">ดูคะแนน</Link>
                      <button className="btn-sm" onClick={() => setEditing({ id: s.id, code: s.code, name: s.name })}>แก้ไข</button>
                      <button className="btn-sm btn-danger" onClick={() => remove(s)}>ลบ</button>
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
        <OutsideScoreDialog student={scoring} onSaved={() => setReload((n) => n + 1)} onClose={() => setScoring(null)} />
      )}
    </>
  );
}

// เลขหน้าแบบย่อ เช่น 1 … 4 5 6 … 12
function pageNumbers(current, total) {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('…');
    out.push(n);
  });
  return out;
}
