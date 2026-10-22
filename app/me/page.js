'use client';

import { useEffect, useState } from 'react';
import { api, formatDate, formatDateTime, formatDelta } from '@/lib/api';
import { LESSONS, lessonName } from '@/lib/lessons';
import { countedSessionIds, isChecked, passStatus, recordTotal } from '@/lib/scoring';
import { getSubject } from '@/lib/subjects';
import PassTag from '../pass-tag';

// หน้าคะแนนของนักเรียน (บัญชีนักเรียนเห็นได้หน้าเดียว ดูได้อย่างเดียว)
export default function MyScoresPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/api/me').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (!data) return error ? <div className="error">{error}</div> : <div className="empty">กำลังโหลด...</div>;
  const { student, subjects } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>คะแนนของฉัน</h1>
          <div className="muted">{student.name} · ชื่อผู้ใช้ {student.username}</div>
        </div>
      </div>

      {student.self_registered && (
        <div className="card pending-links">
          <strong>⏳ บัญชียังไม่ได้ผูกกับรายชื่อของอาจารย์</strong>
          <div className="small" style={{ marginTop: 4 }}>
            ชื่อ IC "{student.name}" ยังไม่ตรงกับรายชื่อในระบบ อาจารย์จะตรวจแล้วผูกให้ หรือถ้าได้รหัสผูกบัญชีจากอาจารย์ ใส่ด้านล่างได้เลย
          </div>
          <LinkForm onLinked={load} compact />
        </div>
      )}

      {subjects.length === 0 && !student.self_registered && <div className="card empty">ยังไม่มีวิชาที่ลงเรียน</div>}

      {subjects.map((s) => <SubjectScores key={s.subject} data={s} />)}

      <details className="card" style={{ marginTop: 24 }}>
        <summary><strong>ตั้งค่าบัญชี</strong></summary>
        <PasswordForm />
      </details>
    </>
  );
}

function SubjectScores({ data }) {
  const subject = getSubject(data.subject);
  const [open, setOpen] = useState(false);
  const counted = countedSessionIds(data.sessions, subject);

  return (
    <div className="card my-subject">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{subject.icon} {subject.name}</h2>
        <div className="my-total"><span className="muted small">คะแนนรวม</span> <strong>{data.total_score}</strong></div>
      </div>
      <div className="row muted small" style={{ marginTop: 6 }}>
        <span>จากคลาส {data.class_score}</span>·<span>นอกคลาส {formatDelta(data.outside_score)}</span>·
        <span>เข้าเรียน {data.attended}/{data.enrolled} คาบ</span>
        {subject.lessons && <>·<span>ผ่านคลาสหลัก {data.passed_lessons.length}/{LESSONS.length} บท</span></>}
      </div>

      <button className="btn-sm" style={{ marginTop: 10 }} onClick={() => setOpen(!open)}>
        {open ? '▲ ซ่อนรายละเอียด' : '▼ ดูคะแนนรายคาบและประวัติ'}
      </button>

      {open && (
        <>
          <h3 style={{ marginTop: 16 }}>รายคาบ</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>วันที่</th><th>คาบ</th><th>เช็คชื่อ</th><th className="num">คะแนน</th></tr></thead>
              <tbody>
                {data.sessions.length === 0 && <tr><td colSpan={4} className="empty">ยังไม่มีคาบเรียน</td></tr>}
                {data.sessions.map((r) => (
                  <tr key={r.session_id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                    <td>
                      {r.title}
                      {r.lesson !== null && subject.lessons && <span className="pill pill-lesson" style={{ marginLeft: 6 }}>{lessonName(r.lesson)}</span>}
                      {subject.lessons && r.lesson !== null && !counted.has(r.session_id) && <span className="muted small"> (ไม่นับ — มีครั้งที่ได้มากกว่า)</span>}
                    </td>
                    <td>{isChecked(r) ? <span className="pill pill-ok">✓</span> : <span className="pill pill-none">-</span>}</td>
                    <td className="num">
                      <strong>{recordTotal(r, subject)}</strong>
                      {subject.passRules && passStatus(r, subject) && <> <PassTag status={passStatus(r, subject)} /></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ marginTop: 16 }}>ประวัติคะแนน</h3>
          <div className="log-list">
            {data.logs.length === 0 && <div className="muted small">ยังไม่มีประวัติ</div>}
            {data.logs.map((l) => (
              <div key={l.id} className="log-item">
                <span className={`delta ${l.delta > 0 ? 'delta-up' : 'delta-down'}`}>{formatDelta(l.delta)}</span>
                <span className="grow">
                  {l.reason || '-'}
                  <span className="muted small"> · {l.kind === 'manual' ? 'นอกคลาส' : l.session_title || 'คาบที่ถูกลบ'}</span>
                </span>
                <span className="muted small" style={{ textAlign: 'right' }}>{l.user_name}<br />{formatDateTime(l.created_at)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ใส่รหัสผูกบัญชีจากอาจารย์ → รวมกับรายชื่อที่อาจารย์เพิ่มไว้
function LinkForm({ onLinked, compact }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/api/me/link', { method: 'POST', body: { claim_code: code } });
      setCode('');
      setFlash(`ผูกกับรายชื่อ "${res.name}" แล้ว คะแนนทั้งหมดรวมกันเรียบร้อย`);
      await onLinked();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={compact ? '' : 'card'} onSubmit={submit} style={{ marginTop: compact ? 12 : 0 }}>
      <div><strong>มีรหัสผูกบัญชีจากอาจารย์?</strong></div>
      <div className="muted small" style={{ marginBottom: 8 }}>ใส่รหัสเพื่อรวมบัญชีนี้กับรายชื่อที่อาจารย์เพิ่มไว้ คะแนนเดิมจะรวมกันทั้งหมด</div>
      {error && <div className="error">{error}</div>}
      {flash && <div className="flash">{flash}</div>}
      <div className="row">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น K7P-29Q" required
          style={{ fontFamily: 'monospace', letterSpacing: 2, width: 160 }} />
        <button className="btn-primary" disabled={busy}>ผูกบัญชี</button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const [form, setForm] = useState({ current: '', password: '' });
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    try {
      await api('/api/me/password', { method: 'POST', body: form });
      setForm({ current: '', password: '' });
      setMsg({ ok: true, text: 'เปลี่ยนรหัสผ่านแล้ว' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 16 }}>
      <div><strong>เปลี่ยนรหัสผ่าน</strong></div>
      {msg && <div className={msg.ok ? 'flash' : 'error'}>{msg.text}</div>}
      <div className="row" style={{ marginTop: 8 }}>
        <input type="password" placeholder="รหัสผ่านเดิม" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} autoComplete="current-password" required />
        <input type="password" placeholder="รหัสผ่านใหม่ (6 ตัวขึ้นไป)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required />
        <button disabled={!form.current || !form.password}>บันทึก</button>
      </div>
    </form>
  );
}
