'use client';

import { useEffect, useState } from 'react';
import { api, formatDateTime } from '@/lib/api';

// นักเรียนที่สมัครเองแล้วชื่อ IC ตรงกับรายชื่อในวิชา แต่ผูกอัตโนมัติไม่ได้ → อาจารย์กดผูกรวม
// (ปกติระบบผูกให้เองตั้งแต่ตอนสมัคร ดู lib/accounts.js)
export default function PendingLinks({ subject, reload, onLinked }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = () => api(`/api/students/matches?subject=${subject.slug}`).then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [subject.slug, reload]);

  async function link(m) {
    if (!confirm(`ผูกบัญชี "${m.username}" (สมัครด้วยชื่อ "${m.other_name}") เข้ากับ "${m.name}"?\n\nชื่อที่อาจารย์ตั้งไว้ "${m.name}" จะเป็นชื่อหลัก`)) return;
    setBusy(m.other_id);
    setError('');
    try {
      await api(`/api/students/${m.student_id}/merge`, { method: 'POST', body: { subject: subject.slug, other_id: m.other_id } });
      await load();
      await onLinked?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!items.length && !error) return null;
  return (
    <div className="card pending-links">
      <h2>🎓 รอผูกบัญชีนักเรียน ({items.length})</h2>
      <div className="muted small" style={{ marginBottom: 10 }}>
        นักเรียนสมัครด้วยชื่อ IC ที่ตรงกับรายชื่อในวิชา แต่ระบบผูกเองไม่ได้ (สมัครก่อนอาจารย์เพิ่มชื่อ หรือมีชื่อซ้ำ) ตรวจว่าเป็นคนเดียวกันแล้วกดผูกรวม
      </div>
      {error && <div className="error">{error}</div>}
      {items.map((m) => (
        <div key={`${m.student_id}-${m.other_id}`} className="pending-item">
          <div className="grow">
            <div><strong>{m.name}</strong> <span className="muted small">(รายชื่อของอาจารย์)</span></div>
            <div className="small">
              ↔ สมัครด้วยชื่อ <strong>{m.other_name}</strong> · ชื่อผู้ใช้ {m.username}
              <span className="muted"> · {formatDateTime(m.signed_up_at)}</span>
            </div>
          </div>
          <button className="btn-primary btn-sm" disabled={busy !== null} onClick={() => link(m)}>
            {busy === m.other_id ? 'กำลังผูก...' : '🔗 ผูกรวม'}
          </button>
        </div>
      ))}
    </div>
  );
}
