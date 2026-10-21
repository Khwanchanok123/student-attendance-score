'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, formatDate, today } from '@/lib/api';
import { LESSONS, lessonName } from '@/lib/lessons';

export default function SessionsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [lesson, setLesson] = useState('');
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);

  const load = () => api('/api/sessions').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const s = await api('/api/sessions', { method: 'POST', body: { title, date, lesson } });
      window.location.href = `/sessions/${s.id}`;
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  async function remove(s) {
    if (!confirm(`ลบคาบ "${s.title}" และข้อมูลเช็คชื่อทั้งหมดของคาบนี้?`)) return;
    try {
      await api(`/api/sessions/${s.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>คาบเรียน</h1>
          <div className="muted">สร้างคาบ แล้วเพิ่มนักเรียนเข้าคาบเพื่อเช็คชื่อและให้คะแนน</div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <form className="card" onSubmit={create}>
        <h2>เพิ่มคาบใหม่</h2>
        <div className="row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <select value={lesson} onChange={(e) => setLesson(e.target.value)}>
            <option value="">คาบทั่วไป (ไม่ใช่คลาสหลัก)</option>
            {LESSONS.map((l) => <option key={l.id} value={l.id}>คลาสหลัก: {l.name}</option>)}
          </select>
          <input
            className="grow"
            placeholder={lesson === '' ? 'ชื่อคาบ' : `ชื่อคาบ (เว้นว่าง = ${lessonName(Number(lesson))})`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required={lesson === ''}
          />
          <button className="btn-primary" disabled={saving}>+ สร้างคาบ</button>
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>
          คลาสหลัก: ถ้านักเรียนเรียนบทเดิมซ้ำ คะแนนรวมจะนับเฉพาะครั้งที่ได้คะแนนสูงสุดของบทนั้น
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>ชื่อคาบ</th>
              <th className="num">นักเรียน</th>
              <th className="num">เข้า-ออกครบ</th>
              <th className="num">ไม่ผ่าน</th>
              <th className="num">คะแนนรวมคาบ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!data && !error && <tr><td colSpan={7} className="empty">กำลังโหลด...</td></tr>}
            {data?.sessions.length === 0 && (
              <tr><td colSpan={7} className="empty">ยังไม่มีคาบเรียน — สร้างคาบแรกด้านบนได้เลย</td></tr>
            )}
            {data?.sessions.map((s) => (
              <tr key={s.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(s.date)}</td>
                <td>
                  <Link href={`/sessions/${s.id}`}><strong>{s.title}</strong></Link>
                  {s.lesson !== null && <div><span className="pill pill-lesson">{lessonName(s.lesson)}</span></div>}
                </td>
                <td className="num">{s.enrolled}</td>
                <td className="num">{s.complete_count} / {s.enrolled}</td>
                <td className="num">
                  {s.fail_count > 0 ? <span className="pill pill-fail">{s.fail_count}</span> : <span className="muted">0</span>}
                </td>
                <td className="num"><strong>{s.total_score}</strong></td>
                <td className="num">
                  <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    <Link href={`/sessions/${s.id}`} className="btn btn-sm">เช็คชื่อ</Link>
                    <button className="btn-sm btn-danger" onClick={() => remove(s)}>ลบ</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
