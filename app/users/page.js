'use client';

import { useEffect, useState } from 'react';
import { api, formatDate } from '@/lib/api';

const emptyForm = { username: '', display_name: '', password: '', role: 'teacher' };

export default function UsersPage() {
  const [users, setUsers] = useState(null);
  const [me, setMe] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api('/api/users').then(setUsers).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api('/api/auth/me').then(setMe).catch(() => {});
  }, []);

  async function run(fn) {
    setSaving(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      await api('/api/users', { method: 'POST', body: form });
      setForm(emptyForm);
    });
  };

  const resetPassword = (u) => {
    const password = prompt(`ตั้งรหัสผ่านใหม่ให้ ${u.display_name} (อย่างน้อย 6 ตัว)`);
    if (!password) return;
    run(() => api(`/api/users/${u.id}`, { method: 'PATCH', body: { password } }));
  };

  const rename = (u) => {
    const display_name = prompt('ชื่อที่แสดง', u.display_name);
    if (!display_name || display_name === u.display_name) return;
    run(() => api(`/api/users/${u.id}`, { method: 'PATCH', body: { display_name } }));
  };

  const toggleRole = (u) =>
    run(() => api(`/api/users/${u.id}`, { method: 'PATCH', body: { role: u.role === 'admin' ? 'teacher' : 'admin' } }));

  const remove = (u) => {
    if (!confirm(`ลบผู้ใช้ ${u.display_name}? (ประวัติคะแนนที่เคยบันทึกจะยังอยู่)`)) return;
    run(() => api(`/api/users/${u.id}`, { method: 'DELETE' }));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ผู้ใช้งาน</h1>
          <div className="muted">บัญชีครู/ผู้ช่วยที่เข้าระบบได้ ชื่อที่แสดงจะถูกบันทึกในประวัติคะแนน</div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <form className="card" onSubmit={add}>
        <h2>เพิ่มผู้ใช้</h2>
        <div className="row">
          <input placeholder="ชื่อที่แสดง เช่น ครูสมศรี" value={form.display_name} onChange={set('display_name')} required className="grow" />
          <input placeholder="ชื่อผู้ใช้ (อังกฤษ)" value={form.username} onChange={set('username')} autoCapitalize="none" required style={{ width: 170 }} />
          <input placeholder="รหัสผ่าน (6 ตัวขึ้นไป)" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required style={{ width: 190 }} />
          <select value={form.role} onChange={set('role')}>
            <option value="teacher">ครู</option>
            <option value="admin">ผู้ดูแล</option>
          </select>
          <button className="btn-primary" disabled={saving}>+ เพิ่ม</button>
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ชื่อที่แสดง</th><th>ชื่อผู้ใช้</th><th>สิทธิ์</th><th>สร้างเมื่อ</th><th></th></tr>
          </thead>
          <tbody>
            {!users && !error && <tr><td colSpan={5} className="empty">กำลังโหลด...</td></tr>}
            {users?.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.display_name}</strong>{me?.id === u.id && <span className="muted small"> (คุณ)</span>}</td>
                <td className="muted">{u.username}</td>
                <td>{u.role === 'admin' ? <span className="pill pill-manual">ผู้ดูแล</span> : <span className="pill pill-none">ครู</span>}</td>
                <td className="muted">{formatDate(String(u.created_at).slice(0, 10))}</td>
                <td className="num">
                  <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    <button className="btn-sm" onClick={() => rename(u)}>แก้ชื่อ</button>
                    <button className="btn-sm" onClick={() => resetPassword(u)}>ตั้งรหัสใหม่</button>
                    {me?.id !== u.id && (
                      <>
                        <button className="btn-sm" onClick={() => toggleRole(u)}>
                          {u.role === 'admin' ? 'เปลี่ยนเป็นครู' : 'ให้สิทธิ์ผู้ดูแล'}
                        </button>
                        <button className="btn-sm btn-danger" onClick={() => remove(u)}>ลบ</button>
                      </>
                    )}
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
