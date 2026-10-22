'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, formatDate, formatDateTime, formatDelta, formatTime } from '@/lib/api';
import { LESSONS, PREREQUISITES, lessonName, requirementText } from '@/lib/lessons';
import { PASS_SCORE, attendancePoints, isChecked, passStatus, recordTotal } from '@/lib/scoring';
import { subjectPath } from '@/lib/subjects';
import PassTag, { PrereqTag } from '../../../../pass-tag';
import { LogList, Modal, ScoreForm } from '../../../../score-form';
import SessionMeta from '../../../../session-meta';
import StudentPicker from '../../../../student-picker';
import { useSubject } from '../../subject-nav';

export default function SessionPage() {
  const subject = useSubject();
  const { id } = useParams();
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState({});
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [scoring, setScoring] = useState(null);
  const [bulkScore, setBulkScore] = useState(null);
  const [flash, setFlash] = useState('');

  const points = subject.checkPoints || 0;

  const load = () =>
    api(`/api/sessions/${id}`)
      .then((d) => {
        // คาบนี้อยู่วิชาอื่น → ไปหน้าของวิชานั้น
        if (d.session.subject !== subject.slug) {
          router.replace(subjectPath(d.session.subject, `/sessions/${id}`));
          return;
        }
        setSession(d.session);
        setRows(d.rows);
      })
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

  function toggleCheck(r) {
    if (isChecked(r)) {
      const note = points ? ` (คะแนนเช็คชื่อ ${points} จะถูกหักคืน)` : '';
      if (!confirm(`ยกเลิกการเช็คชื่อของ ${r.name}?${note}`)) return;
      update(r.student_id, { checked: false });
    } else {
      update(r.student_id, { checked: true });
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

  async function checkAll() {
    if (!confirm(`เช็คชื่อให้นักเรียนทุกคนในคาบนี้ที่ยังไม่ได้เช็ค?${points ? ` (ได้คนละ +${points})` : ''}`)) return;
    try {
      await api(`/api/sessions/${id}/records`, { method: 'POST', body: { action: 'check_all' } });
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

  async function setClosed(close) {
    if (close) {
      // ผลที่จะได้ถ้าปิดตอนนี้ (passStatus ตัดสินเฉพาะคาบที่ปิดแล้ว)
      const preview = rows.map((r) => passStatus({ ...r, closed: true }, subject));
      const result = subject.passRules
        ? `\n\nผ่าน ${preview.filter((s) => s === 'pass').length} คน · ไม่ผ่าน ${preview.filter((s) => s === 'fail').length} คน`
          + ` · ไม่ได้เช็คชื่อ ${rows.length - stats.checked} คน`
        : '';
      if (!confirm(`ปิดคลาส "${session.title}"?${result}\n\nหลังปิดจะเช็คชื่อ ให้คะแนน และเพิ่ม/นำนักเรียนออกไม่ได้ จนกว่าจะเปิดคลาสอีกครั้ง`)) return;
    } else if (!confirm('เปิดคลาสอีกครั้ง? จะกลับมาแก้ไขเช็คชื่อและคะแนนได้ และผลผ่าน/ไม่ผ่านจะถูกยกเลิกจนกว่าจะปิดคลาสใหม่')) {
      return;
    }
    try {
      await api(`/api/sessions/${id}/close`, { method: 'POST', body: close ? {} : { reopen: true } });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeSession() {
    if (!confirm(`ลบคาบ "${session.title}" และข้อมูลเช็คชื่อทั้งหมด?`)) return;
    await api(`/api/sessions/${id}`, { method: 'DELETE' });
    router.push(subjectPath(subject));
  }

  const stats = useMemo(() => ({
    checked: rows.filter(isChecked).length,
    passed: rows.filter((r) => passStatus(r, subject) === 'pass').length,
    failed: rows.filter((r) => passStatus(r, subject) === 'fail').length,
    total: rows.reduce((sum, r) => sum + recordTotal(r, subject), 0),
  }), [rows, subject]);

  const enrolledIds = useMemo(() => new Set(rows.map((r) => r.student_id)), [rows]);

  const visible = rows.filter((r) =>
    r.name.toLowerCase().includes(search.trim().toLowerCase()));

  if (!session) {
    return error ? <div className="error">{error}</div> : <div className="empty">กำลังโหลด...</div>;
  }

  const scoringRow = scoring && rows.find((r) => r.student_id === scoring);
  const closed = Boolean(session.closed_at);

  return (
    <>
      <div className="small"><Link href={subjectPath(subject)}>← กลับไปหน้าคาบเรียน</Link></div>

      <div className="page-head" style={{ marginTop: 8 }}>
        {editing ? (
          <form className="row" onSubmit={saveSession}>
            <input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} required />
            {subject.lessons && (
              <select value={editing.lesson} onChange={(e) => setEditing({ ...editing, lesson: e.target.value })}>
                <option value="">คาบทั่วไป</option>
                {LESSONS.map((l) => <option key={l.id} value={l.id}>คลาสหลัก: {l.name}</option>)}
              </select>
            )}
            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required />
            <button className="btn-primary">บันทึก</button>
            <button type="button" onClick={() => setEditing(null)}>ยกเลิก</button>
          </form>
        ) : (
          <div>
            <h1>
              {session.title}{' '}
              {closed ? <span className="pill pill-ok status-pill">✅ ปิดคลาสแล้ว</span> : <span className="pill pill-live status-pill">🟢 กำลังเรียน</span>}
            </h1>
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
        {!editing && (
          <div className="row">
            {!closed && rows.length > 0 && (
              <>
                <button onClick={checkAll}>✓ เช็คชื่อทั้งหมด</button>
                <button className="btn-plus" onClick={() => setBulkScore(5)}>+5 ทั้งคลาส</button>
                <button className="btn-plus" onClick={() => setBulkScore(10)}>+10 ทั้งคลาส</button>
              </>
            )}
            {closed
              ? <button onClick={() => setClosed(false)}>🔓 เปิดคลาสอีกครั้ง</button>
              : <button className="btn-primary" onClick={() => setClosed(true)}>🏁 ปิดคลาส</button>}
          </div>
        )}
      </div>

      {closed && (
        <div className="closed-banner">
          🔒 ปิดคลาสแล้วโดย {session.closed_by_name || '-'} · {formatDateTime(session.closed_at)} — การเช็คชื่อและคะแนนถูกล็อก
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {flash && <div className="flash" style={{ marginBottom: 12 }}>✓ {flash}</div>}

      <div className="stats">
        <div className="stat"><div className="label">นักเรียนในคาบ</div><div className="value">{rows.length}</div></div>
        <div className="stat">
          <div className="label">เช็คชื่อแล้ว{points ? ` (+${points})` : ''}</div>
          <div className="value">{stats.checked} / {rows.length}</div>
        </div>
        {subject.passRules && !closed && (
          <div className="stat"><div className="label">ผ่าน/ไม่ผ่าน</div><div className="value muted" style={{ fontSize: '0.95rem' }}>ตัดสินตอนปิดคลาส</div></div>
        )}
        {subject.passRules && closed && (
          <>
            <div className="stat"><div className="label">ผ่าน ({PASS_SCORE} ขึ้นไป)</div><div className="value" style={{ color: stats.passed ? 'var(--success)' : undefined }}>{stats.passed}</div></div>
            <div className="stat"><div className="label">ไม่ผ่าน (ต่ำกว่า {PASS_SCORE})</div><div className="value" style={{ color: stats.failed ? 'var(--danger)' : undefined }}>{stats.failed}</div></div>
          </>
        )}
        <div className="stat"><div className="label">คะแนนรวมคาบ</div><div className="value">{stats.total}</div></div>
      </div>

      {!closed && <div className="card">
        <h2>เพิ่มนักเรียนเข้าคาบ</h2>
        {PREREQUISITES[session.lesson] && (
          <div className="muted small" style={{ marginTop: -6, marginBottom: 8 }}>
            {lessonName(session.lesson)} {requirementText(session.lesson)} — คนที่ยังไม่ผ่านจะมีแท็ก ⚠ ต่อท้ายชื่อ (ยังเพิ่มเข้าคาบได้)
          </div>
        )}
        <StudentPicker
          subject={subject}
          lesson={session.lesson}
          isDisabled={(s) => (enrolledIds.has(s.id) ? 'อยู่ในคาบแล้ว' : null)}
          onError={setError}
          onPick={async ({ student, newStudent }) => {
            const body = newStudent ? { new_students: [newStudent] } : { student_ids: [student.id] };
            await api(`/api/sessions/${id}/students`, { method: 'POST', body });
            await load();
          }}
        />
      </div>}

      {rows.length === 0 ? (
        <div className="card empty">ยังไม่มีนักเรียนในคาบนี้{!closed && ' — ค้นหาหรือพิมพ์ชื่อเพื่อเพิ่มด้านบน'}</div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="grow" placeholder="กรองรายชื่อในคาบ..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th className="center">เช็คชื่อ</th>
                  {points > 0 && <th className="num">คะแนนเช็คชื่อ</th>}
                  <th className="num">เพิ่ม/ลด</th>
                  <th className="num">คะแนนในคาบ</th>
                  {subject.passRules && <th className="center">ผล</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <Row
                    key={r.student_id}
                    r={r}
                    subject={subject}
                    lesson={session.lesson}
                    closed={closed}
                    busy={busy[r.student_id]}
                    onCheck={toggleCheck}
                    onScore={() => setScoring(r.student_id)}
                    onRemove={removeFromSession}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {bulkScore && (
        <BulkScoreDialog
          sessionId={id}
          amount={bulkScore}
          total={rows.length}
          checked={stats.checked}
          onDone={async (count) => {
            setBulkScore(null);
            await load();
            setFlash(`บันทึกคะแนนให้ ${count} คนแล้ว`);
            setTimeout(() => setFlash(''), 3000);
          }}
          onClose={() => setBulkScore(null)}
        />
      )}

      {scoringRow && (
        <ScoreDialog
          sessionId={id}
          subject={subject}
          closed={closed}
          r={scoringRow}
          onSaved={(rec) => patchRow(scoringRow.student_id, rec)}
          onSaveNote={(note) => update(scoringRow.student_id, { note })}
          onClose={() => setScoring(null)}
        />
      )}
    </>
  );
}

function Row({ r, subject, lesson, closed, busy, onCheck, onScore, onRemove }) {
  const status = passStatus(r, subject);
  return (
    <tr className={status === 'fail' ? 'row-fail' : ''}>
      <td>
        <Link href={subjectPath(subject, `/students/${r.student_id}`)}>{r.name}</Link>
        <div><PrereqTag lesson={lesson} passedLessons={r.passed_lessons} /></div>
        {r.note && <div className="muted small">📝 {r.note}</div>}
      </td>
      <td className="center">
        <button className={`check ${isChecked(r) ? 'on-out' : ''}`} disabled={busy || closed} onClick={() => onCheck(r)}>
          {isChecked(r) ? `✓ ${formatTime(r.check_in_at)}` : 'เช็คชื่อ'}
        </button>
      </td>
      {subject.checkPoints > 0 && (
        <td className="num">
          <span className={`pill ${isChecked(r) ? 'pill-ok' : 'pill-none'}`}>{attendancePoints(r, subject)}</span>
        </td>
      )}
      <td className="num">
        {r.extra_score
          ? <span className={`delta ${r.extra_score > 0 ? 'delta-up' : 'delta-down'}`}>{formatDelta(r.extra_score)}</span>
          : <span className="muted">0</span>}
      </td>
      <td className="num"><strong style={{ fontSize: '1.1rem' }}>{recordTotal(r, subject)}</strong></td>
      {subject.passRules && <td className="center"><PassTag status={status} /></td>}
      <td className="num">
        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
          {closed
            ? <button className="btn-sm" onClick={onScore}>ประวัติ</button>
            : (
              <>
                <button className="btn-sm btn-primary" disabled={busy} onClick={onScore}>± คะแนน</button>
                <button className="btn-sm btn-danger" title="นำออกจากคาบ" disabled={busy} onClick={() => onRemove(r)}>✕</button>
              </>
            )}
        </div>
      </td>
    </tr>
  );
}

// หน้าต่างเพิ่ม/ลดคะแนนให้ทั้งคลาส (ทุกคนในคาบ หรือเฉพาะคนที่เช็คชื่อแล้ว) — บันทึกประวัติรายคน
function BulkScoreDialog({ sessionId, amount, total, checked, onDone, onClose }) {
  const [onlyChecked, setOnlyChecked] = useState(false);
  const count = onlyChecked ? checked : total;

  async function submit(delta, reason) {
    if (!count) throw new Error('ยังไม่มีนักเรียนที่เช็คชื่อแล้ว');
    const res = await api(`/api/sessions/${sessionId}/scores`, {
      method: 'POST',
      body: { all: true, only_checked: onlyChecked, delta, reason },
    });
    await onDone(res.count);
  }

  return (
    <Modal title="เพิ่ม/ลดคะแนนทั้งคลาส" subtitle={`จะบันทึกให้ ${count} คน · ทุกคนมีประวัติแยกรายคน`} onClose={onClose}>
      <label className="row small" style={{ gap: 8, margin: '8px 0 14px', cursor: 'pointer' }}>
        <input type="checkbox" checked={onlyChecked} onChange={(e) => setOnlyChecked(e.target.checked)} />
        <span>ให้เฉพาะคนที่เช็คชื่อแล้ว ({checked} จาก {total} คน)</span>
      </label>
      <ScoreForm key={amount} onSubmit={submit} initialAmount={amount} initialReason="คะแนนทั้งคลาส" />
    </Modal>
  );
}

// หน้าต่างเพิ่ม/ลดคะแนนของนักเรียนในคาบนี้ พร้อมหมายเหตุและประวัติ
function ScoreDialog({ sessionId, subject, closed, r, onSaved, onSaveNote, onClose }) {
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

  const status = passStatus(r, subject);

  return (
    <Modal title={r.name} subtitle="คะแนนในคาบนี้" onClose={onClose}>
      <div className="score-breakdown">
        {subject.checkPoints > 0 && (
          <>
            <div><div className="muted small">เช็คชื่อ</div><div className="big">{attendancePoints(r, subject)}</div></div>
            <div className="op">+</div>
            <div><div className="muted small">เพิ่ม/ลด</div><div className="big">{formatDelta(r.extra_score)}</div></div>
            <div className="op">=</div>
          </>
        )}
        <div><div className="muted small">คะแนนในคาบ</div><div className="big" style={{ color: 'var(--primary)' }}>{recordTotal(r, subject)}</div></div>
        {subject.passRules && (
          <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            {status ? <PassTag status={status} /> : <span className="muted small">ผ่าน/ไม่ผ่าน ตัดสินตอนปิดคลาส</span>}
          </div>
        )}
      </div>

      {closed
        ? <div className="closed-banner">🔒 คาบนี้ปิดคลาสแล้ว — เปิดคลาสอีกครั้งเพื่อเพิ่ม/ลดคะแนน</div>
        : <ScoreForm onSubmit={submit} />}

      <label className="field" style={{ marginTop: 16 }}>
        <span>โน้ตประจำคาบ (ไม่มีผลกับคะแนน)</span>
        <input
          value={note}
          placeholder="-"
          disabled={closed}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== r.note && onSaveNote(note)}
        />
      </label>

      <h3 className="small" style={{ margin: '16px 0 8px' }}>ประวัติคะแนนในคาบนี้</h3>
      <LogList logs={logs} />
    </Modal>
  );
}
