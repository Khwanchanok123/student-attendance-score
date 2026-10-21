'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, formatDate, formatDelta } from '@/lib/api';
import { lessonName } from '@/lib/lessons';
import { countedSessionIds, isComplete, passStatus, recordTotal } from '@/lib/scoring';

export default function SummaryPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api('/api/summary').then(setData).catch((e) => setError(e.message)); }, []);

  const table = useMemo(() => {
    if (!data) return null;
    const sessionById = new Map(data.sessions.map((s) => [s.id, s]));
    const byKey = new Map(data.records.map((r) => [`${r.student_id}:${r.session_id}`, r]));

    const rows = data.students.map((st) => {
      const entries = data.records
        .filter((r) => r.student_id === st.id)
        .map((r) => ({ ...r, lesson: sessionById.get(r.session_id).lesson, date: sessionById.get(r.session_id).date }));
      const counted = countedSessionIds(entries);
      const cells = data.sessions.map((se) => {
        const r = byKey.get(`${st.id}:${se.id}`);
        return r && { ...r, counted: counted.has(se.id) };
      });
      return {
        ...st,
        cells,
        attended: cells.filter(isComplete).length,
        total: cells.reduce((sum, c) => sum + (c?.counted ? recordTotal(c) : 0), 0) + st.outside_score,
      };
    });
    // เรียงคะแนนรวมจากมากไปน้อย (คะแนนเท่ากันเรียงตามรหัส) และให้อันดับร่วมกัน เช่น 1, 2, 2, 4
    rows.sort((a, b) => b.total - a.total);
    rows.forEach((r, i) => { r.rank = i > 0 && r.total === rows[i - 1].total ? rows[i - 1].rank : i + 1; });
    const sessionTotals = data.sessions.map((_, i) => rows.reduce((sum, r) => sum + (r.cells[i] ? recordTotal(r.cells[i]) : 0), 0));
    return { rows, sessionTotals, grand: rows.reduce((s, r) => s + r.total, 0) };
  }, [data]);

  function exportCsv() {
    const head = ['อันดับ', 'รหัส', 'ชื่อ', ...data.sessions.map((s) => `${s.date} ${s.title}`), 'นอกคลาส', 'เข้าครบ (คาบ)', 'คะแนนรวม'];
    const lines = table.rows.map((r) => [
      r.rank, r.code || '', r.name,
      ...r.cells.map((c) => {
        if (!c) return '';
        const status = passStatus(c);
        return `${recordTotal(c)}${status === 'fail' ? ' (ไม่ผ่าน)' : ''}${c.counted ? '' : ' (ไม่นับ)'}`;
      }),
      r.outside_score, r.attended, r.total,
    ]);
    const csv = [head, ...lines]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    // ใส่ BOM เพื่อให้ Excel อ่านภาษาไทยถูก
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `สรุปคะแนน-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>สรุปคะแนน</h1>
          <div className="muted">เรียงตามคะแนนรวมจากมากไปน้อย</div>
        </div>
        {table && table.rows.length > 0 && <button onClick={exportCsv}>⬇ ดาวน์โหลด Excel (CSV)</button>}
      </div>

      <div className="legend small muted">
        <span><span className="cell-fail-sample">8</span> ไม่ผ่าน (ต่ำกว่า 10 หลังเช็คออก)</span>
        <span><s>15</s> ไม่นับ (เรียนบทเดิมซ้ำ นับเฉพาะครั้งที่สูงสุด)</span>
        <span>– ไม่ได้อยู่ในคาบ</span>
      </div>

      {error && <div className="error">{error}</div>}
      {!data && !error && <div className="empty">กำลังโหลด...</div>}

      {table && (
        table.rows.length === 0 ? (
          <div className="card empty">ยังไม่มีข้อมูลนักเรียน</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="center">อันดับ</th>
                  <th>รหัส</th>
                  <th>ชื่อ</th>
                  {data.sessions.map((s) => (
                    <th key={s.id} className="num">
                      <Link href={`/sessions/${s.id}`}>{s.title}</Link>
                      <div className="small muted" style={{ fontWeight: 400 }}>{formatDate(s.date)}</div>
                      {s.lesson !== null && s.title !== lessonName(s.lesson) && (
                        <div className="small muted" style={{ fontWeight: 400 }}>{lessonName(s.lesson)}</div>
                      )}
                    </th>
                  ))}
                  <th className="num">นอกคลาส</th>
                  <th className="num">เข้าครบ</th>
                  <th className="num">รวม</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="center"><span className={`rank rank-${r.rank}`}>{r.rank <= 3 && r.total > 0 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span></td>
                    <td className="muted">{r.code || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><Link href={`/students/${r.id}`}>{r.name}</Link></td>
                    {r.cells.map((c, i) => (
                      <td key={i} className={`num ${c && passStatus(c) === 'fail' ? 'cell-fail' : ''}`}>
                        {!c ? <span className="muted">–</span>
                          : c.counted ? recordTotal(c)
                            : <s className="muted" title="ไม่นับ: มีครั้งอื่นของบทนี้ที่คะแนนสูงกว่า">{recordTotal(c)}</s>}
                      </td>
                    ))}
                    <td className="num">{r.outside_score ? formatDelta(r.outside_score) : <span className="muted">0</span>}</td>
                    <td className="num">{r.attended}</td>
                    <td className="num"><strong>{r.total}</strong></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>รวมทั้งหมด</td>
                  {table.sessionTotals.map((t, i) => <td key={i} className="num">{t}</td>)}
                  <td className="num">{formatDelta(table.rows.reduce((s, r) => s + r.outside_score, 0))}</td>
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
