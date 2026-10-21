'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, formatDate, formatDateTime, formatDelta } from '@/lib/api';
import { LESSONS, PREREQUISITES, lessonEligibility, lessonName } from '@/lib/lessons';
import { attendancePoints, countedSessionIds, isComplete, passStatus, recordTotal } from '@/lib/scoring';
import PassTag, { PrereqTag } from '../../pass-tag';
import OutsideScoreDialog from '../../outside-score-dialog';

export default function StudentPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [scoring, setScoring] = useState(false);

  const load = () => api(`/api/students/${id}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  if (!data) return error ? <div className="error">{error}</div> : <div className="empty">กำลังโหลด...</div>;
  const { student, sessions, logs } = data;
  const counted = countedSessionIds(sessions);
  // บทที่ผ่านแล้ว = มีอย่างน้อย 1 ครั้งที่ผ่าน (ตรงกับ passed_lessons ใน lib/db.js)
  const passedLessons = [...new Set(sessions.filter((s) => s.lesson !== null && passStatus(s) === 'pass').map((s) => s.lesson))];

  return (
    <>
      <div className="small">
        <a href="#" onClick={(e) => { e.preventDefault(); router.back(); }}>← กลับ</a>
      </div>

      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <h1>{student.name}</h1>
          <div className="muted">รหัส {student.code || '-'}</div>
        </div>
        <button className="btn-primary" onClick={() => setScoring(true)}>± คะแนนนอกคลาส</button>
      </div>

      <div className="stats">
        <div className="stat stat-main"><div className="label">คะแนนรวม</div><div className="value">{student.total_score}</div></div>
        <div className="stat"><div className="label">จากคลาส</div><div className="value">{student.class_score}</div></div>
        <div className="stat"><div className="label">นอกคลาส</div><div className="value">{formatDelta(student.outside_score)}</div></div>
        <div className="stat"><div className="label">ลงเรียน</div><div className="value">{student.enrolled} คาบ</div></div>
        <div className="stat"><div className="label">เข้า-ออกครบ</div><div className="value">{student.attended} คาบ</div></div>
        <div className="stat"><div className="label">ผ่านคลาสหลัก</div><div className="value">{passedLessons.length} / {LESSONS.length} บท</div></div>
      </div>
      <div className="muted small" style={{ marginTop: -8, marginBottom: 20 }}>
        คะแนนรวม = คะแนนจากคลาส (คาบทั่วไปทุกคาบ + คะแนนสูงสุดของแต่ละบทในคลาสหลัก) + คะแนนนอกคลาส
      </div>

      <h2>คลาสหลัก</h2>
      <div className="lesson-grid">
        {LESSONS.map((l) => {
          const attempts = sessions.filter((s) => s.lesson === l.id);
          const best = attempts.find((s) => counted.has(s.session_id));
          return (
            <div key={l.id} className={`lesson-card ${best ? `lesson-${passStatus(best) || 'pending'}` : ''}`}>
              <div className="small"><strong>{l.name}</strong></div>
              {PREREQUISITES[l.id] && (
                <div className="small" style={{ margin: '4px 0' }}>
                  {lessonEligibility(l.id, passedLessons).ok
                    ? <span className="pill pill-ok">✓ ผ่านเงื่อนไขเข้าเรียน</span>
                    : <PrereqTag lesson={l.id} passedLessons={passedLessons} />}
                </div>
              )}
              {best ? (
                <>
                  <div className="lesson-score">{recordTotal(best)}</div>
                  <div className="row small" style={{ gap: 6 }}>
                    <PassTag status={passStatus(best)} />
                    <span className="muted">เรียน {attempts.length} ครั้ง</span>
                  </div>
                </>
              ) : (
                <div className="muted small" style={{ marginTop: 8 }}>ยังไม่เรียน</div>
              )}
            </div>
          );
        })}
      </div>

      <h2>คะแนนรายคาบ</h2>
      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>คาบ</th>
              <th className="center">เข้า-ออก</th>
              <th className="num">เข้าเรียน</th>
              <th className="num">เพิ่ม/ลด</th>
              <th className="num">คะแนนในคาบ</th>
              <th className="center">ผล</th>
              <th>นับในคะแนนรวม</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && <tr><td colSpan={8} className="empty">ยังไม่ได้ลงเรียนคาบไหน</td></tr>}
            {sessions.map((s) => (
              <tr key={s.session_id} className={counted.has(s.session_id) ? '' : 'row-uncounted'}>
                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(s.date)}</td>
                <td>
                  <Link href={`/sessions/${s.session_id}`}>{s.title}</Link>
                  {s.lesson !== null && <div><span className="pill pill-lesson">{lessonName(s.lesson)}</span></div>}
                </td>
                <td className="center">
                  {isComplete(s)
                    ? <span className="pill pill-ok">ครบ</span>
                    : s.check_in_at
                      ? <span className="pill pill-half">เข้าอย่างเดียว</span>
                      : <span className="pill pill-none">ขาด</span>}
                </td>
                <td className="num">{attendancePoints(s)}</td>
                <td className="num">{s.extra_score ? formatDelta(s.extra_score) : 0}</td>
                <td className="num"><strong className="score-value">{recordTotal(s)}</strong></td>
                <td className="center"><PassTag status={passStatus(s)} /></td>
                <td className="small">
                  {counted.has(s.session_id)
                    ? <span style={{ color: 'var(--success)' }}>✓ นับ</span>
                    : <span className="muted">ไม่นับ (มีครั้งอื่นของบทนี้ที่คะแนนสูงกว่า)</span>}
                </td>
              </tr>
            ))}
          </tbody>
          {sessions.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5} className="num">คะแนนจากคลาส (เฉพาะคาบที่นับ)</td>
                <td className="num">{student.class_score}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <h2>ประวัติการเปลี่ยนแปลงคะแนน</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>วันเวลา</th>
              <th>คาบ</th>
              <th className="num">คะแนน</th>
              <th>เหตุผล</th>
              <th>ผู้บันทึก</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={5} className="empty">ยังไม่มีประวัติ</td></tr>}
            {logs.map((l) => (
              <tr key={l.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(l.created_at)}</td>
                <td>
                  {l.kind === 'manual'
                    ? <span className="pill pill-manual">นอกคลาส</span>
                    : l.session_id
                      ? <Link href={`/sessions/${l.session_id}`}>{l.session_title}</Link>
                      : <span className="muted">(คาบถูกลบ)</span>}
                </td>
                <td className="num">
                  <span className={`delta ${l.delta > 0 ? 'delta-up' : 'delta-down'}`}>{formatDelta(l.delta)}</span>
                </td>
                <td>
                  {l.reason || <span className="muted">-</span>}
                  {l.kind === 'session' && <span className="muted small"> (อัตโนมัติ)</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{l.user_name || <span className="muted">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scoring && (
        <OutsideScoreDialog student={student} onSaved={load} onClose={() => setScoring(false)} />
      )}
    </>
  );
}
