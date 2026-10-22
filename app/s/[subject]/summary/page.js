'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, formatDelta } from '@/lib/api';
import { countedSessionIds, isChecked, passStatus, recordTotal } from '@/lib/scoring';
import { subjectPath } from '@/lib/subjects';
import { useSubject } from '../subject-nav';

// ตารางสรุปคะแนนของวิชา: อันดับ / ชื่อ / คะแนนในคลาส / นอกคลาส / เช็คชื่อ / รวม
// (คะแนนรายคาบดูได้ในหน้านักเรียน และในไฟล์ CSV)
export default function SummaryPage() {
  const subject = useSubject();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/summary?subject=${subject.slug}`).then(setData).catch((e) => setError(e.message));
  }, [subject.slug]);

  const table = useMemo(() => {
    if (!data) return null;
    const sessionById = new Map(data.sessions.map((s) => [s.id, s]));
    const byKey = new Map(data.records.map((r) => [`${r.student_id}:${r.session_id}`, r]));

    const rows = data.students.map((st) => {
      const entries = data.records
        .filter((r) => r.student_id === st.id)
        .map((r) => ({ ...r, lesson: sessionById.get(r.session_id).lesson, date: sessionById.get(r.session_id).date }));
      const counted = countedSessionIds(entries, subject);
      const cells = data.sessions.map((se) => {
        const r = byKey.get(`${st.id}:${se.id}`);
        return r && { ...r, counted: counted.has(se.id) };
      });
      const classScore = cells.reduce((sum, c) => sum + (c?.counted ? recordTotal(c, subject) : 0), 0);
      return {
        ...st,
        cells,
        classScore,
        enrolled: cells.filter(Boolean).length,
        attended: cells.filter(isChecked).length,
        total: classScore + st.outside_score,
      };
    });
    // เรียงคะแนนรวมจากมากไปน้อย (คะแนนเท่ากันเรียงตามชื่อ) และให้อันดับร่วมกัน เช่น 1, 2, 2, 4
    rows.sort((a, b) => b.total - a.total);
    rows.forEach((r, i) => { r.rank = i > 0 && r.total === rows[i - 1].total ? rows[i - 1].rank : i + 1; });
    const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
    return { rows, classTotal: sum('classScore'), outsideTotal: sum('outside_score'), grand: sum('total') };
  }, [data, subject]);

  // CSV มีคะแนนรายคาบครบ (ใน Excel ไม่เบียดกัน)
  function exportCsv() {
    const head = ['อันดับ', 'ชื่อ', ...data.sessions.map((s) => `${s.date} ${s.title}`), 'คะแนนในคลาส', 'นอกคลาส', 'เช็คชื่อ (คาบ)', 'คะแนนรวม'];
    const lines = table.rows.map((r) => [
      r.rank, r.name,
      ...r.cells.map((c) => {
        if (!c) return '';
        const status = passStatus(c, subject);
        return `${recordTotal(c, subject)}${status === 'fail' ? ' (ไม่ผ่าน)' : ''}${c.counted ? '' : ' (ไม่นับ)'}`;
      }),
      r.classScore, r.outside_score, r.attended, r.total,
    ]);
    const csv = [head, ...lines]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    // ใส่ BOM เพื่อให้ Excel อ่านภาษาไทยถูก
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `สรุปคะแนน-${subject.name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="page-head">
        <div className="muted">
          เรียงตามคะแนนรวมจากมากไปน้อย · กดที่ชื่อเพื่อดูคะแนนรายคาบ
          {subject.lessons && ' · คลาสหลักที่เรียนซ้ำนับเฉพาะครั้งที่คะแนนสูงสุด'}
        </div>
        {table && table.rows.length > 0 && <button onClick={exportCsv}>⬇ ดาวน์โหลด Excel (CSV)</button>}
      </div>

      {error && <div className="error">{error}</div>}
      {!data && !error && <div className="empty">กำลังโหลด...</div>}

      {table && (
        table.rows.length === 0 ? (
          <div className="card empty">ยังไม่มีนักเรียนในวิชานี้</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="center">อันดับ</th>
                  <th>ชื่อ</th>
                  <th className="num">คะแนนในคลาส</th>
                  <th className="num">นอกคลาส</th>
                  <th className="num">เช็คชื่อ</th>
                  <th className="num">รวม</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="center"><span className={`rank rank-${r.rank}`}>{r.rank <= 3 && r.total > 0 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span></td>
                    <td><Link href={subjectPath(subject, `/students/${r.id}`)}>{r.name}</Link></td>
                    <td className="num">{r.classScore}</td>
                    <td className="num">{r.outside_score ? formatDelta(r.outside_score) : <span className="muted">0</span>}</td>
                    <td className="num">{r.attended} <span className="muted small">/ {r.enrolled} คาบ</span></td>
                    <td className="num"><strong>{r.total}</strong></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>รวมทั้งหมด</td>
                  <td className="num">{table.classTotal}</td>
                  <td className="num">{formatDelta(table.outsideTotal)}</td>
                  <td></td>
                  <td className="num">{table.grand}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}
    </>
  );
}
