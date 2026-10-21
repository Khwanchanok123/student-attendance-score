'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PRESET_MAX_LENGTH, SYSTEM_REASON_PRESETS } from '@/lib/reasons';

export default function SettingsPage() {
  const [presets, setPresets] = useState(null);
  const [me, setMe] = useState(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/presets').then(setPresets).catch((e) => setError(e.message));
    api('/api/auth/me').then(setMe).catch(() => {});
  }, []);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      setPresets(await fn());
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    if (await run(() => api('/api/presets', { method: 'POST', body: { text } }))) setText('');
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (await run(() => api(`/api/presets/${editing.id}`, { method: 'PATCH', body: { text: editing.text } }))) {
      setEditing(null);
    }
  }

  const move = (p, dir) => run(() => api(`/api/presets/${p.id}`, { method: 'PATCH', body: { move: dir } }));

  const remove = (p) => {
    if (!confirm(`ลบหมายเหตุ "${p.text}"?`)) return;
    run(() => api(`/api/presets/${p.id}`, { method: 'DELETE' }));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ตั้งค่า</h1>
          <div className="muted">{me ? `ของ ${me.display_name}` : ' '}</div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>หมายเหตุของฉัน</h2>
        <div className="muted small" style={{ marginBottom: 12 }}>
          แสดงในดรอปดาวน์ "หมายเหตุของฉัน" ตอนเพิ่ม/ลดคะแนน ทั้งในคาบและนอกคลาส — เป็นของคุณคนเดียว ผู้ใช้คนอื่นตั้งของตัวเองแยกกัน
        </div>

        <form className="row" onSubmit={add} style={{ marginBottom: 16 }}>
          <input
            className="grow"
            placeholder="พิมพ์หมายเหตุใหม่ เช่น ส่งงานตรงเวลา"
            value={text}
            maxLength={PRESET_MAX_LENGTH}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn-primary" disabled={busy || !text.trim()}>+ เพิ่ม</button>
        </form>

        {!presets && !error && <div className="muted small">กำลังโหลด...</div>}
        {presets?.length === 0 && <div className="empty">ยังไม่มีหมายเหตุของคุณ — เพิ่มอันแรกด้านบนได้เลย</div>}

        <div className="preset-list">
          {presets?.map((p, i) => (
            <div key={p.id} className="preset-row">
              {editing?.id === p.id ? (
                <form className="row grow" onSubmit={saveEdit}>
                  <input
                    className="grow"
                    value={editing.text}
                    maxLength={PRESET_MAX_LENGTH}
                    onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                    autoFocus
                  />
                  <button className="btn-primary btn-sm" disabled={busy || !editing.text.trim()}>บันทึก</button>
                  <button type="button" className="btn-sm" onClick={() => setEditing(null)}>ยกเลิก</button>
                </form>
              ) : (
                <>
                  <span className="muted small" style={{ minWidth: 20 }}>{i + 1}.</span>
                  <span className="grow">{p.text}</span>
                  <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                    <button className="btn-sm" title="เลื่อนขึ้น" disabled={busy || i === 0} onClick={() => move(p, 'up')}>↑</button>
                    <button className="btn-sm" title="เลื่อนลง" disabled={busy || i === presets.length - 1} onClick={() => move(p, 'down')}>↓</button>
                    <button className="btn-sm" disabled={busy} onClick={() => setEditing({ id: p.id, text: p.text })}>แก้ไข</button>
                    <button className="btn-sm btn-danger" disabled={busy} onClick={() => remove(p)}>ลบ</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>หมายเหตุระบบ</h2>
        <div className="muted small" style={{ marginBottom: 12 }}>
          ทุกคนเห็นเหมือนกัน แสดงในดรอปดาวน์ "หมายเหตุระบบ" (แก้ไขได้ที่ไฟล์ lib/reasons.js)
        </div>
        <div className="preset-list">
          {SYSTEM_REASON_PRESETS.map((t, i) => (
            <div key={t} className="preset-row">
              <span className="muted small" style={{ minWidth: 20 }}>{i + 1}.</span>
              <span className="grow">{t}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
