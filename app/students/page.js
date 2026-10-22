'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, formatDateTime, pageNumbers, parseStudentLine } from '@/lib/api';
import StudentPicker from '../student-picker';

const PAGE_SIZE = 20;

const FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'no_subject', label: 'ยังไม่อยู่ในวิชาใด' },
  { value: 'has_account', label: 'มีบัญชีแล้ว' },
  { value: 'no_account', label: 'ยังไม่มีบัญชี' },
];

export default function Page() {
  return (
    <Suspense fallback={<div className="empty">กำลังโหลด...</div>}>
      <RosterPage />
    </Suspense>
  );
}

// รายชื่อนักเรียนกลาง: ทุกคนในระบบ ทุกวิชา (หน้ารายชื่อในแต่ละวิชาใช้ข้อมูลชุดเดียวกันนี้)
function RosterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') || '';
  const filter = params.get('filter') || 'all';

  const [data, setData] = useState(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(q);
  const [bulk, setBulk] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  function go(next) {
    const state = { page, q, filter, ...next };
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.filter !== 'all') p.set('filter', state.filter);
    if (state.page > 1) p.set('page', String(state.page));
    const qs = p.toString();
    router.replace(`/students${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  useEffect(() => {
    const t = setTimeout(() => { if (search.trim() !== q) go({ page: 1, q: search.trim() }); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    api(`/api/roster?page=${page}&pageSize=${PAGE_SIZE}&filter=${filter}&q=${encodeURIComponent(q)}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [page, q, filter, reload]);

  const refresh = () => setReload((n) => n + 1);

  async function run(fn) {
    setSaving(true);
    setError('');
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const bulkCount = bulk.split('\n').filter((l) => l.trim()).length;
  const addBulk = () => run(async () => {
    const list = bulk.split('\n').filter((l) => l.trim()).map(parseStudentLine);
    await api('/api/roster', { method: 'POST', body: { students: list } });
    setBulk('');
  });

  const saveEdit = (e) => {
    e.preventDefault();
    run(async () => {
      await api(`/api/students/${editing.id}`, { method: 'PATCH', body: editing });
      setEditing(null);
    });
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const firstIndex = data ? (data.page - 1) * data.pageSize : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🗂 นักเรียนทั้งหมด</h1>
          <div className="muted">
            รายชื่อกลางของทุกวิชา — เพิ่มนักเรียนจากหน้ารายชื่อของวิชาหรือในคาบก็มาอยู่ที่นี่ แก้ชื่อที่นี่ก็เปลี่ยนทุกวิชา
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <UnlinkedAccounts reload={reload} onChange={refresh} onError={setError} />

      <details className="card">
        <summary><strong>เพิ่มนักเรียนเข้าระบบ</strong> <span className="muted small">(ยังไม่เข้าวิชาใด — เพิ่มเข้าวิชาได้จากหน้ารายชื่อของวิชา)</span></summary>
        <div className="muted small" style={{ margin: '8px 0' }}>
          1 ชื่อต่อบรรทัด เช่น <code>Draco Malfoy</code> — ถ้าชื่อตรงกับคนที่มีอยู่แล้วจะใช้คนเดิม
        </div>
        <textarea rows={3} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Draco Malfoy\nLuna Lovegood'} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn-primary" onClick={addBulk} disabled={saving || !bulkCount}>เพิ่ม {bulkCount || ''} คน</button>
        </div>
      </details>

      <div className="row" style={{ margin: '16px 0 12px' }}>
        <input className="grow" type="search" placeholder="🔍 ค้นหาชื่อนักเรียน..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.value} className={filter === f.value ? 'btn-primary' : ''} onClick={() => go({ page: 1, filter: f.value })}>{f.label}</button>
          ))}
        </div>
      </div>
      <div className="muted small" style={{ marginBottom: 8 }}>{data ? `${data.total} คน` : ' '}</div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th className="num">#</th><th>ชื่อ</th><th>บัญชี</th><th></th></tr>
          </thead>
          <tbody>
            {!data && !error && <tr><td colSpan={4} className="empty">กำลังโหลด...</td></tr>}
            {data?.items.length === 0 && <tr><td colSpan={4} className="empty">ไม่พบนักเรียน</td></tr>}
            {data?.items.map((s, i) => editing?.id === s.id ? (
              <tr key={s.id}>
                <td colSpan={4}>
                  <form className="row" onSubmit={saveEdit}>
                    <input className="grow" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
                    <button className="btn-primary btn-sm" disabled={saving}>บันทึก</button>
                    <button type="button" className="btn-sm" onClick={() => setEditing(null)}>ยกเลิก</button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={s.id}>
                <td className="num muted">{firstIndex + i + 1}</td>
                <td>
                  <Link href={`/students/${s.id}`}><strong>{s.name}</strong></Link>
                  {s.self_registered && <span className="pill pill-none" style={{ marginLeft: 6 }}>สมัครเอง</span>}
                </td>
                <td>{s.account_username ? <span className="pill pill-ok">🎓 {s.account_username}</span> : <span className="muted">-</span>}</td>
                <td className="num">
                  <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    <Link href={`/students/${s.id}`} className="btn btn-sm">จัดการ</Link>
                    <button className="btn-sm" onClick={() => setEditing({ id: s.id, name: s.name })}>แก้ไข</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.total > data.pageSize && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => go({ page: page - 1 })}>‹ ก่อนหน้า</button>
          {pageNumbers(page, totalPages).map((n, i) => n === '…'
            ? <span key={`gap${i}`} className="muted">…</span>
            : <button key={n} className={n === page ? 'btn-primary' : ''} onClick={() => go({ page: n })}>{n}</button>)}
          <button disabled={page >= totalPages} onClick={() => go({ page: page + 1 })}>ถัดไป ›</button>
        </div>
      )}
    </>
  );
}

// นักเรียนที่สมัครเองแล้วยังไม่ได้ผูกกับรายชื่อของอาจารย์ — เลือกรายชื่อที่จะผูก หรือรับเป็นรายชื่อใหม่
function UnlinkedAccounts({ reload, onChange, onError }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api('/api/roster?filter=unlinked&pageSize=50').then((d) => setItems(d.items)).catch((e) => onError(e.message));
  }, [reload]);

  if (!items.length) return null;

  async function link(self, { student: target }) {
    if (!confirm(`ผูกบัญชี "${self.account_username}" (สมัครด้วยชื่อ "${self.name}") เข้ากับ "${target.name}"?\n\nคะแนนทั้งหมดจะรวมกัน และใช้ชื่อ "${target.name}" เป็นชื่อหลัก`)) {
      throw new Error('ยกเลิก');
    }
    await api(`/api/students/${target.id}/merge`, { method: 'POST', body: { other_id: self.id } });
    onChange();
    return `ผูก ${self.name} แล้ว`;
  }

  async function accept(self) {
    if (!confirm(`รับ "${self.name}" เป็นนักเรียนใหม่? (ไม่ผูกกับรายชื่ออื่น)`)) return;
    try {
      await api(`/api/roster/${self.id}`, { method: 'POST', body: { action: 'accept' } });
      onChange();
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <div className="card pending-links">
      <h2>🎓 สมัครแล้วยังไม่ได้ผูก ({items.length})</h2>
      <div className="muted small" style={{ marginBottom: 10 }}>
        นักเรียนสมัครด้วยชื่อ IC ที่ไม่ตรงกับรายชื่อในระบบ — ค้นหารายชื่อที่เป็นคนเดียวกันเพื่อผูก หรือกด "นักเรียนใหม่" ถ้ายังไม่เคยมีชื่อในระบบ
      </div>
      {items.map((s) => (
        <div key={s.id} className="pending-item" style={{ flexWrap: 'wrap' }}>
          <div style={{ minWidth: 200 }}>
            <strong>{s.name}</strong>
            <div className="muted small">ชื่อผู้ใช้ {s.account_username} · สมัคร {formatDateTime(s.created_at)}</div>
          </div>
          <div className="grow" style={{ minWidth: 240 }}>
            <StudentPicker
              subject={null}
              allowNew={false}
              placeholder="🔍 ค้นหารายชื่อที่จะผูก..."
              isDisabled={(t) => (t.id === s.id ? 'คนนี้' : t.account_username ? 'มีบัญชีแล้ว' : null)}
              onPick={(pick) => link(s, pick)}
              onError={(m) => m !== 'ยกเลิก' && onError(m)}
            />
          </div>
          <button className="btn-sm" onClick={() => accept(s)}>✓ นักเรียนใหม่</button>
        </div>
      ))}
    </div>
  );
}
