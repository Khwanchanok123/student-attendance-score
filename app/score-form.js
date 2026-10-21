'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, formatDateTime, formatDelta } from '@/lib/api';
import { SYSTEM_REASON_PRESETS } from '@/lib/reasons';

const QUICK = [1, 2, 5, 10];

// ฟอร์มเพิ่ม/ลดคะแนน: จำนวน + หมายเหตุ (เลือก preset หรือพิมพ์เอง)
// onSubmit(delta, reason) ต้องคืน Promise; ถ้า throw จะแสดงข้อความผิดพลาด
export function ScoreForm({ onSubmit }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [presets, setPresets] = useState(null);

  // หมายเหตุของฉัน (ของผู้ใช้ที่ล็อกอินอยู่ ตั้งค่าได้ที่ /settings)
  useEffect(() => {
    api('/api/presets').then(setPresets).catch(() => setPresets([]));
  }, []);

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

      <div className="amount-box">
        <label className="amount-label" htmlFor="score-amount">จำนวนคะแนน</label>
        <input
          id="score-amount"
          className="amount-input"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
        <div className="amount-quick">
          {QUICK.map((n) => (
            <button key={n} type="button" className={amount === String(n) ? 'btn-primary' : ''} onClick={() => setAmount(String(n))}>{n}</button>
          ))}
        </div>
      </div>

      <div className="row muted small" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <span>หมายเหตุ (เลือกจากรายการแล้วแก้ต่อได้ หรือพิมพ์เอง)</span>
        <Link href="/settings">⚙ จัดการหมายเหตุของฉัน</Link>
      </div>
      <div className="preset-pickers">
        <SearchSelect
          label="หมายเหตุของฉัน"
          options={presets?.map((p) => p.text)}
          empty={<>ยังไม่มี — เพิ่มได้ที่ <Link href="/settings">หน้าตั้งค่า</Link></>}
          onPick={setReason}
        />
        <SearchSelect label="หมายเหตุระบบ" options={SYSTEM_REASON_PRESETS} onPick={setReason} />
      </div>
      <input
        style={{ width: '100%', margin: '8px 0' }}
        placeholder="พิมพ์หมายเหตุ หรือเลือกจากรายการด้านบน..."
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

// ดรอปดาวน์ที่พิมพ์ค้นหาได้: เลือกแล้วเรียก onPick(ข้อความ) และล้างช่องค้นหา
// options = รายการข้อความ (undefined = กำลังโหลด)
function SearchSelect({ label, options, empty, onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const query = q.trim().toLowerCase();
  const items = (options ?? []).filter((t) => t.toLowerCase().includes(query));

  function pick(text) {
    if (text === undefined) return;
    onPick(text);
    setQ('');
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); if (open) pick(items[active]); }
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="combo">
      <div className="muted small" style={{ marginBottom: 4 }}>{label}</div>
      <input
        type="search"
        placeholder={`🔍 ค้นหา${label}...`}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { setOpen(true); setActive(0); }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className="combo-menu">
          {!options && <div className="combo-empty">กำลังโหลด...</div>}
          {options && options.length === 0 && <div className="combo-empty">{empty || 'ไม่มีรายการ'}</div>}
          {options?.length > 0 && items.length === 0 && <div className="combo-empty">ไม่พบ "{q}"</div>}
          {items.map((t, i) => (
            <div
              key={t + i}
              className={`combo-item ${i === active ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(t); }}
              onMouseEnter={() => setActive(i)}
            >
              {t}
            </div>
          ))}
        </div>
      )}
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
