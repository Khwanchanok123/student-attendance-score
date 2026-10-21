'use client';

import { useEffect, useState } from 'react';
import { formatDateTime, formatDelta } from '@/lib/api';
import { REASON_PRESETS } from '@/lib/reasons';

const QUICK = [1, 2, 5, 10];

// ฟอร์มเพิ่ม/ลดคะแนน: จำนวน + หมายเหตุ (เลือก preset หรือพิมพ์เอง)
// onSubmit(delta, reason) ต้องคืน Promise; ถ้า throw จะแสดงข้อความผิดพลาด
export function ScoreForm({ onSubmit }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(sign) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setError('กรุณาใส่จำนวนคะแนนมากกว่า 0'); return; }
    if (!reason.trim()) { setError('กรุณาเลือกหรือพิมพ์หมายเหตุ'); return; }
    setSaving(true);
    setError('');
    try {
      await onSubmit(sign * n, reason.trim());
      setAmount('');
      setReason('');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}

      <div className="muted small" style={{ marginBottom: 6 }}>จำนวนคะแนน</div>
      <div className="row" style={{ marginBottom: 12 }}>
        {QUICK.map((n) => (
          <button key={n} type="button" className={`btn-sm ${amount === String(n) ? 'btn-primary' : ''}`} onClick={() => setAmount(String(n))}>{n}</button>
        ))}
        <input
          type="number"
          min="0"
          step="any"
          placeholder="จำนวน"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: 100 }}
        />
      </div>

      <div className="muted small" style={{ marginBottom: 6 }}>หมายเหตุ (เลือกจากรายการ หรือพิมพ์เอง)</div>
      <div className="presets">
        {REASON_PRESETS.map((p) => (
          <button key={p} type="button" className={`preset ${reason === p ? 'active' : ''}`} onClick={() => setReason(p)}>{p}</button>
        ))}
      </div>
      <input
        style={{ width: '100%', margin: '8px 0' }}
        placeholder="หรือพิมพ์หมายเหตุเอง..."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit(1)}
      />
      <div className="row">
        <button className="btn-plus grow" disabled={saving} onClick={() => submit(1)}>＋ เพิ่มคะแนน</button>
        <button className="btn-minus grow" disabled={saving} onClick={() => submit(-1)}>－ ลดคะแนน</button>
      </div>
    </div>
  );
}

// รายการประวัติคะแนน (ในหน้าต่าง)
export function LogList({ logs }) {
  return (
    <div className="log-list">
      {!logs && <div className="muted small">กำลังโหลด...</div>}
      {logs?.length === 0 && <div className="muted small">ยังไม่มีประวัติ</div>}
      {logs?.map((l) => (
        <div key={l.id} className="log-item">
          <span className={`delta ${l.delta > 0 ? 'delta-up' : 'delta-down'}`}>{formatDelta(l.delta)}</span>
          <span className="grow">{l.reason || '-'}{l.kind === 'session' && <span className="muted small"> (อัตโนมัติ)</span>}</span>
          <span className="muted small" style={{ textAlign: 'right' }}>{l.user_name}<br />{formatDateTime(l.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

// กรอบหน้าต่าง (ปิดด้วยปุ่ม, Esc หรือคลิกพื้นหลัง)
export function Modal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>{title}</h2>
            {subtitle && <div className="muted small">{subtitle}</div>}
          </div>
          <button className="btn-sm" onClick={onClose}>✕ ปิด</button>
        </div>
        {children}
      </div>
    </div>
  );
}
