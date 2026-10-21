'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, formatDate, formatDelta, formatTime, parseStudentLine } from '@/lib/api';
import { LESSONS, PREREQUISITES, lessonName, requirementText } from '@/lib/lessons';
import { ATTENDANCE_POINTS, PASS_SCORE, attendancePoints, isComplete, passStatus, recordTotal } from '@/lib/scoring';
import PassTag, { PrereqTag } from '../../pass-tag';
import { LogList, Modal, ScoreForm } from '../../score-form';
import SessionMeta from '../../session-meta';

export default function SessionPage() {
  const { id } = useParams();
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState({});
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [scoring, setScoring] = useState(null);

  const load = () =>
    api(`/api/sessions/${id}`)
      .then((d) => { setSession(d.session); setRows(d.rows); })
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, [id]);

  // โหลดเฉพาะข้อมูลคาบใหม่ เพื่ออัปเดตบรรทัด "อัปเดตล่าสุดโดย" หลังมีการเปลี่ยนแปลงในคาบ
  const refreshMeta = () => api(`/api/sessions/${id}`).then((d) => setSession(d.session)).catch(() => {});

  const patchRow = (studentId, rec) => {
    setRows((rs) => rs.map((r) => (r.student_id === studentId ? { ...r, ...rec } : r)));
    refreshMeta();
  };

  async function update(studentId, patch) {
    setBusy((b) => ({ ...b, [studentId]: true }));
    setError('');
    try {
      const rec = await api(`/api/sessions/${id}/records`, {
        method: 'PUT',
        body: { student_id: studentId, ...patch },
      });
      patchRow(studentId, rec);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy((b) => ({ ...b, [studentId]: false }));
    }
  }

  function toggleIn(r) {
    if (r.check_in_at) {
      if (!confirm(`ยกเลิกการเช็คเข้าของ ${r.name}? (การเช็คออกจะถูกยกเลิกด้วย)`)) return;
      update(r.student_id, { check_in: false });
    } else {
      update(r.student_id, { check_in: true });
    }
  }

  function toggleOut(r) {
    if (r.check_out_at) {
      if (!confirm(`ยกเลิกการเช็คออกของ ${r.name}?`)) return;
      update(r.student_id, { check_out: false });
    } else {
      update(r.student_id, { check_out: true });
    }
  }

  async function removeFromSession(r) {
    if (!confirm(`นำ ${r.name} ออกจากคาบนี้? (ข้อมูลเช็คชื่อและคะแนนในคาบนี้ของคนนี้จะถูกลบ)`)) return;
    try {
      await api(`/api/sessions/${id}/students?student_id=${r.student_id}`, { method: 'DELETE' });
      setRows((rs) => rs.filter((x) => x.student_id !== r.student_id));
      refreshMeta();
    } catch (e) {
      setError(e.message);
    }
  }

  async function bulk(action, label) {
    if (!confirm(`${label}?`)) return;
    try {
      await api(`/api/sessions/${id}/records`, { method: 'POST', body: { action } });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveSession(e) {
    e.preventDefault();
    try {
      setSession(await api(`/api/sessions/${id}`, { method: 'PATCH', body: editing }));
      setEditing(null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeSession() {
    if (!confirm(`ลบคาบ "${session.title}" และข้อมูลเช็คชื่อทั้งหมด?`)) return;
    await api(`/api/sessions/${id}`, { method: 'DELETE' });
    router.push('/');
  }

  const stats = useMemo(() => ({
    checkedIn: rows.filter((r) => r.check_in_at).length,
    complete: rows.filter(isComplete).length,
    passed: rows.filter((r) => passStatus(r) === 'pass').length,
    failed: rows.filter((r) => passStatus(r) === 'fail').length,
  }), [rows]);

  const enrolledIds = useMemo(() => new Set(rows.map((r) => r.student_id)), [rows]);

  const visible = rows.filter((r) =>
    `${r.code || ''} ${r.name}`.toLowerCase().includes(search.trim().toLowerCase()));

  if (!session) {
    return error ? <div className="error">{error}</div> : <div className="empty">กำลังโหลด...</div>;
  }

  const scoringRow = scoring && rows.find((r) => r.student_id === scoring);

  return (
    <>
      <div className="small"><Link href="/">← กลับไปหน้าคาบเรียน</Link></div>

      <div className="page-head" style={{ marginTop: 8 }}>
        {editing ? (
          <form className="row" onSubmit={saveSession}>
            <input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} required />
            <select value={editing.lesson} onChange={(e) => setEditing({ ...editing, lesson: e.target.value })}>
              <option value="">คาบทั่วไป</option>
              {LESSONS.map((l) => <option key={l.id} value={l.id}>คลาสหลัก: {l.name}</option>)}
            </select>
            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required />
            <button className="btn-primary">บันทึก</button>
            <button type="button" onClick={() => setEditing(null)}>ยกเลิก</button>
          </form>
        ) : (
          <div>
            <h1>{session.title}</h1>
            <div className="muted">
              {formatDate(session.date)}
              {session.lesson !== null && <> · <span className="pill pill-lesson">{lessonName(session.lesson)}</span></>}
              {' · '}
              <a href="#" onClick={(e) => {
                e.preventDefault();
                setEditing({ title: session.title, date: session.date, lesson: session.lesson ?? '' });
              }}>แก้ไข</a>
              {' · '}
              <a href="#" style={{ color: 'var(--danger)' }} onClick={(e) => { e.preventDefault(); removeSession(); }}>ลบคาบ</a>
            </div>
            <SessionMeta session={session} inline />
          </div>
        )}
        {rows.length > 0 && (
          <div className="row">
            <button onClick={() => bulk('checkin_all', 'เช็คเข้าให้นักเรียนทุกคนในคาบนี้')}>✓ เช็คเข้าทั้งหมด</button>
            <button onClick={() => bulk('checkout_all', 'เช็คออกให้ทุกคนที่เช็คเข้าแล้ว')}>✓ เช็คออกทั้งหมด</button>
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="stats">
        <div className="stat"><div className="label">นักเรียนในคาบ</div><div className="value">{rows.length}</div></div>
        <div className="stat"><div className="label">เช็คเข้าแล้ว</div><div className="value">{stats.checkedIn} / {rows.length}</div></div>
        <div className="stat"><div className="label">เข้า-ออกครบ (+{ATTENDANCE_POINTS})</div><div className="value">{stats.complete} / {rows.length}</div></div>
        <div className="stat"><div className="label">ผ่าน ({PASS_SCORE} ขึ้นไป)</div><div className="value" style={{ color: stats.passed ? 'var(--success)' : undefined }}>{stats.passed}</div></div>
        <div className="stat"><div className="label">ไม่ผ่าน (ต่ำกว่า {PASS_SCORE})</div><div className="value" style={{ color: stats.failed ? 'var(--danger)' : undefined }}>{stats.failed}</div></div>
      </div>

      <StudentPicker sessionId={id} lesson={session.lesson} enrolledIds={enrolledIds} onAdded={load} onError={setError} />

      {rows.length === 0 ? (
        <div className="card empty">ยังไม่มีนักเรียนในคาบนี้ — ค้นหาหรือพิมพ์ชื่อเพื่อเพิ่มด้านบน</div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="grow" placeholder="กรองรายชื่อในคาบ..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>ชื่อ</th>
                  <th className="center">เข้า</th>
                  <th className="center">ออก</th>
                  <th className="num">เข้าเรียน</th>
                  <th className="num">เพิ่ม/ลด</th>
                  <th className="num">คะแนนในคาบ</th>
                  <th className="center">ผล</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <Row
                    key={r.student_id}
                    r={r}
                    lesson={session.lesson}
                    busy={busy[r.student_id]}
                    onIn={toggleIn}
                    onOut={toggleOut}
                    onScore={() => setScoring(r.student_id)}
                    onRemove={removeFromSession}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {scoringRow && (
        <ScoreDialog
          sessionId={id}
          r={scoringRow}
          onSaved={(rec) => patchRow(scoringRow.student_id, rec)}
          onSaveNote={(note) => update(scoringRow.student_id, { note })}
          onClose={() => setScoring(null)}
        />
      )}
    </>
  );
}

function Row({ r, lesson, busy, onIn, onOut, onScore, onRemove }) {
  const status = passStatus(r);
  return (
    <tr className={status === 'fail' ? 'row-fail' : ''}>
      <td className="muted">{r.code || '-'}</td>
      <td>
        <Link href={`/students/${r.student_id}`}>{r.name}</Link>
        <div><PrereqTag lesson={lesson} passedLessons={r.passed_lessons} /></div>
        {r.note && <div className="muted small">📝 {r.note}</div>}
      </td>
      <td className="center">
        <button className={`check ${r.check_in_at ? 'on-in' : ''}`} disabled={busy} onClick={() => onIn(r)}>
          {r.check_in_at ? `✓ ${formatTime(r.check_in_at)}` : 'เช็คเข้า'}
        </button>
      </td>
      <td className="center">
        <button
          className={`check ${r.check_out_at ? 'on-out' : ''}`}
          disabled={busy || !r.check_in_at}
          title={!r.check_in_at ? 'ต้องเช็คเข้าก่อน' : ''}
          onClick={() => onOut(r)}
        >
          {r.check_out_at ? `✓ ${formatTime(r.check_out_at)}` : 'เช็คออก'}
        </button>
      </td>
      <td className="num">
        {isComplete(r)
          ? <span className="pill pill-ok">{attendancePoints(r)}</span>
          : <span className={`pill ${r.check_in_at ? 'pill-half' : 'pill-none'}`} title={r.check_in_at ? 'ยังไม่เช็คออก' : ''}>0</span>}
      </td>
      <td className="num">
        {r.extra_score
          ? <span className={`delta ${r.extra_score > 0 ? 'delta-up' : 'delta-down'}`}>{formatDelta(r.extra_score)}</span>
          : <span className="muted">0</span>}
      </td>
      <td className="num"><strong style={{ fontSize: '1.1rem' }}>{recordTotal(r)}</strong></td>
      <td className="center"><PassTag status={passStatus(r)} /></td>
      <td className="num">
        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
          <button className="btn-sm btn-primary" disabled={busy} onClick={onScore}>± คะแนน</button>
          <button className="btn-sm btn-danger" title="นำออกจากคาบ" disabled={busy} onClick={() => onRemove(r)}>✕</button>
        </div>
      </td>
    </tr>
  );
}

// หน้าต่างเพิ่ม/ลดคะแนนของนักเรียนในคาบนี้ พร้อมหมายเหตุและประวัติ
function ScoreDialog({ sessionId, r, onSaved, onSaveNote, onClose }) {
  const [note, setNote] = useState(r.note);
  const [logs, setLogs] = useState(null);

  const loadLogs = () =>
    api(`/api/sessions/${sessionId}/scores?student_id=${r.student_id}`).then(setLogs).catch(() => setLogs([]));
  useEffect(() => { loadLogs(); }, [r.student_id]);

  async function submit(delta, reason) {
    const rec = await api(`/api/sessions/${sessionId}/scores`, {
      method: 'POST',
      body: { student_id: r.student_id, delta, reason },
    });
    onSaved(rec);
    await loadLogs();
  }

  return (
    <Modal title={r.name} subtitle={`รหัส ${r.code || '-'} · คะแนนในคาบนี้`} onClose={onClose}>
      <div className="score-breakdown">
        <div><div className="muted small">เข้าเรียน</div><div className="big">{attendancePoints(r)}</div></div>
        <div className="op">+</div>
        <div><div className="muted small">เพิ่ม/ลด</div><div className="big">{formatDelta(r.extra_score)}</div></div>
        <div className="op">=</div>
        <div><div className="muted small">คะแนนในคาบ</div><div className="big" style={{ color: 'var(--primary)' }}>{recordTotal(r)}</div></div>
        <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
          {passStatus(r) ? <PassTag status={passStatus(r)} /> : <span className="muted small">ผ่าน/ไม่ผ่าน แสดงหลังเช็คออก</span>}
        </div>
      </div>

      <ScoreForm onSubmit={submit} />

      <label className="field" style={{ marginTop: 16 }}>
        <span>โน้ตประจำคาบ (ไม่มีผลกับคะแนน)</span>
        <input
          value={note}
          placeholder="-"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== r.note && onSaveNote(note)}
        />
      </label>

      <h3 className="small" style={{ margin: '16px 0 8px' }}>ประวัติคะแนนในคาบนี้</h3>
      <LogList logs={logs} />
    </Modal>
  );
}

// ช่องค้นหาแบบดรอปดาวน์: เลือกนักเรียนที่มีในระบบ หรือเพิ่มชื่อที่พิมพ์เป็นนักเรียนใหม่
function StudentPicker({ sessionId, lesson, enrolledIds, onAdded, onError }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = setTimeout(() => {
      api(`/api/students?pageSize=8&q=${encodeURIComponent(q.trim())}`)
        .then((d) => { if (alive) { setResults(d); setActive(0); } })
        .catch((e) => alive && onError(e.message));
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open]);

  const typed = parseStudentLine(q);
  const hasExact = results?.items.some((s) => s.name.trim() === typed.name);
  const options = [
    ...(results?.items ?? []).map((s) => ({ key: `s${s.id}`, student: s, disabled: enrolledIds.has(s.id) })),
    ...(typed.name && !hasExact ? [{ key: 'new', isNew: true }] : []),
  ];

  async function choose(opt) {
    if (!opt || opt.disabled || busy) return;
    setBusy(true);
    try {
      const body = opt.isNew ? { new_students: [typed] } : { student_ids: [opt.student.id] };
      await api(`/api/sessions/${sessionId}/students`, { method: 'POST', body });
      setFlash(`เพิ่ม ${opt.isNew ? typed.name : opt.student.name} เข้าคาบแล้ว`);
      setTimeout(() => setFlash(''), 2000);
      setQ('');
      await onAdded();
    } catch (e) {
      onError(e.message);
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
    <div className="card">
      <h2>เพิ่มนักเรียนเข้าคาบ</h2>
      {PREREQUISITES[lesson] && (
        <div className="muted small" style={{ marginTop: -6, marginBottom: 8 }}>
          {lessonName(lesson)} {requirementText(lesson)} — คนที่ยังไม่ผ่านจะมีแท็ก ⚠ ต่อท้ายชื่อ (ยังเพิ่มเข้าคาบได้)
        </div>
      )}
      <div className="combo">
        <input
          type="search"
          placeholder="🔍 พิมพ์ชื่อหรือรหัส แล้วเลือกจากรายการ (ถ้าไม่มี เพิ่มเป็นนักเรียนใหม่ได้)"
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
                  <span>＋ เพิ่ม <strong>{typed.name}</strong>{typed.code && <span className="muted"> (รหัส {typed.code})</span>} เป็นนักเรียนใหม่</span>
                ) : (
                  <>
                    <span className="combo-label">
                      <span><span className="muted">{opt.student.code || '-'}</span> {opt.student.name}</span>
                      <PrereqTag lesson={lesson} passedLessons={opt.student.passed_lessons} />
                    </span>
                    <span className="muted small">{opt.disabled ? 'อยู่ในคาบแล้ว' : 'เพิ่ม ↵'}</span>
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
