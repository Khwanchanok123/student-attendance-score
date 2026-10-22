'use client';

import { useEffect, useState } from 'react';
import { api, parseStudentLine } from '@/lib/api';
import { PrereqTag } from './pass-tag';

// ช่องค้นหาแบบดรอปดาวน์: ค้นจากนักเรียนทุกคนในระบบ (ทุกวิชา) หรือเพิ่มชื่อที่พิมพ์เป็นนักเรียนใหม่
// - subject = null: ใช้ในหน้ารายชื่อกลาง (ค้นจาก /api/roster)
// - isDisabled(student) → ข้อความเหตุผลถ้าเลือกไม่ได้ (เช่น "อยู่ในคาบแล้ว") หรือ null
// - onPick({ student } | { newStudent: { code, name } }) ต้องคืน Promise; คืนข้อความสำเร็จได้
// - lesson: ถ้ามี จะแสดงแท็กเงื่อนไขก่อนเรียน (เช่น บท 4) ต่อท้ายชื่อ
export default function StudentPicker({ subject, isDisabled, onPick, onError, lesson = null, placeholder, allowNew = true }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = setTimeout(() => {
      const query = `pageSize=8&q=${encodeURIComponent(q.trim())}`;
      api(subject ? `/api/students?subject=${subject.slug}&all=1&${query}` : `/api/roster?${query}`)
        .then((d) => { if (alive) { setResults(d); setActive(0); } })
        .catch((e) => alive && onError?.(e.message));
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, reload]);

  const typed = parseStudentLine(q);
  const hasExact = results?.items.some((s) => s.name.trim() === typed.name);
  const options = [
    ...(results?.items ?? []).map((s) => ({ key: `s${s.id}`, student: s, disabled: isDisabled?.(s) || null })),
    ...(allowNew && typed.name && !hasExact ? [{ key: 'new', isNew: true }] : []),
  ];

  async function choose(opt) {
    if (!opt || opt.disabled || busy) return;
    setBusy(true);
    try {
      const name = opt.isNew ? typed.name : opt.student.name;
      const message = await onPick(opt.isNew ? { newStudent: typed } : { student: opt.student });
      setFlash(typeof message === 'string' ? message : `เพิ่ม ${name} แล้ว`);
      setTimeout(() => setFlash(''), 2000);
      setQ('');
      setReload((n) => n + 1);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, options.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); choose(options[active]); }
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div>
      <div className="combo">
        <input
          type="search"
          placeholder={placeholder || '🔍 พิมพ์ชื่อ แล้วเลือกจากรายการ (ถ้าไม่มี เพิ่มเป็นนักเรียนใหม่ได้)'}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {open && (
          <div className="combo-menu">
            {!results && <div className="combo-empty">กำลังค้นหา...</div>}
            {results && options.length === 0 && <div className="combo-empty">ยังไม่มีนักเรียนในระบบ — พิมพ์ชื่อเพื่อเพิ่มใหม่</div>}
            {options.map((opt, i) => (
              <div
                key={opt.key}
                className={`combo-item ${i === active ? 'active' : ''} ${opt.disabled ? 'disabled' : ''} ${opt.isNew ? 'combo-new' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); choose(opt); }}
                onMouseEnter={() => setActive(i)}
              >
                {opt.isNew ? (
                  <span>＋ เพิ่ม <strong>{typed.name}</strong> เป็นนักเรียนใหม่</span>
                ) : (
                  <>
                    <span className="combo-label">
                      <span>{opt.student.name}</span>
                      {opt.student.self_registered && <span className="pill pill-none">สมัครเอง</span>}
                      {(opt.student.has_account || opt.student.account_username) && <span className="pill pill-ok" title="มีบัญชีนักเรียนแล้ว">🎓</span>}
                      <PrereqTag lesson={lesson} passedLessons={opt.student.passed_lessons} />
                    </span>
                    <span className="muted small">{opt.disabled || 'เพิ่ม ↵'}</span>
                  </>
                )}
              </div>
            ))}
            {results && results.total > results.items.length && (
              <div className="combo-empty">แสดง {results.items.length} จาก {results.total} คน — พิมพ์ให้เจาะจงขึ้น</div>
            )}
          </div>
        )}
      </div>
      {flash && <div className="flash">{flash}</div>}
    </div>
  );
}
