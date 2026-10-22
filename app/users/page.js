'use client';

import { useEffect, useState } from 'react';
import { api, formatDate } from '@/lib/api';
import { ROLES, roleInfo } from '@/lib/roles';
import { SUBJECTS, getSubject, shortName } from '@/lib/subjects';
import { Modal } from '../score-form';

const emptyForm = { username: '', display_name: '', password: '', role: 'subject', subjects: [] };

export default function UsersPage() {
  const [users, setUsers] = useState(null);
  const [me, setMe] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
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

  const remove = (u) => {
    if (!confirm(`ลบผู้ใช้ ${u.display_name}? (ประวัติคะแนนที่เคยบันทึกจะยังอยู่)`)) return;
    run(() => api(`/api/users/${u.id}`, { method: 'DELETE' }));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ผู้ใช้งาน</h1>
          <div className="muted">บัญชีที่เข้าระบบได้ และวิชาที่แต่ละคนเห็น ชื่อที่แสดงจะถูกบันทึกในประวัติคะแนน</div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <form className="card" onSubmit={add}>
        <h2>เพิ่มผู้ใช้</h2>
        <div className="row">
          <input placeholder="ชื่อที่แสดง เช่น ศจ.สมศรี" value={form.display_name} onChange={set('display_name')} required className="grow" />
          <input placeholder="ชื่อผู้ใช้ (อังกฤษ)" value={form.username} onChange={set('username')} autoCapitalize="none" required style={{ width: 170 }} />
          <input placeholder="รหัสผ่าน (6 ตัวขึ้นไป)" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required style={{ width: 190 }} />
        </div>
        <AccessFields value={form} onChange={(v) => setForm({ ...form, ...v })} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn-primary" disabled={saving}>+ เพิ่มผู้ใช้</button>
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ชื่อที่แสดง</th><th>ชื่อผู้ใช้</th><th>บทบาท</th><th>วิชาที่เห็น</th><th>สร้างเมื่อ</th><th></th></tr>
          </thead>
          <tbody>
            {!users && !error && <tr><td colSpan={6} className="empty">กำลังโหลด...</td></tr>}
            {users?.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.display_name}</strong>{me?.id === u.id && <span className="muted small"> (คุณ)</span>}</td>
                <td className="muted">{u.username}</td>
                <td><span className={`pill ${roleInfo(u.role).pill}`}>{roleInfo(u.role).label}</span></td>
                <td><SubjectList user={u} /></td>
                <td className="muted">{formatDate(String(u.created_at).slice(0, 10))}</td>
                <td className="num">
                  <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    {me?.id !== u.id && <button className="btn-sm" onClick={() => setEditing(u)}>🔑 แก้สิทธิ์</button>}
                    <button className="btn-sm" onClick={() => rename(u)}>แก้ชื่อ</button>
                    <button className="btn-sm" onClick={() => resetPassword(u)}>ตั้งรหัสใหม่</button>
                    {me?.id !== u.id && <button className="btn-sm btn-danger" onClick={() => remove(u)}>ลบ</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <AccessDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSave={async (access) => {
            await api(`/api/users/${editing.id}`, { method: 'PATCH', body: access });
            setEditing(null);
            await load();
          }}
        />
      )}
    </>
  );
}

// วิชาที่ผู้ใช้เห็น (ในตาราง)
function SubjectList({ user }) {
  if (user.role !== 'subject') return <span className="muted small">ทุกวิชา</span>;
  return (
    <div className="row" style={{ gap: 4 }}>
      {(user.subjects || []).map(getSubject).filter(Boolean).map((s) => (
        <span key={s.slug} className="pill pill-none small" title={s.name}>{s.icon} {shortName(s)}</span>
      ))}
    </div>
  );
}

// เลือกบทบาท + วิชา (ใช้ทั้งตอนเพิ่มและแก้ไข)
function AccessFields({ value, onChange }) {
  const toggle = (slug) => onChange({
    subjects: value.subjects.includes(slug) ? value.subjects.filter((s) => s !== slug) : [...value.subjects, slug],
  });
  return (
    <div style={{ marginTop: 12 }}>
      <div className="muted small" style={{ marginBottom: 6 }}>บทบาท</div>
      <div className="role-options">
        {ROLES.map((r) => (
          <label key={r.value} className={`role-option ${value.role === r.value ? 'active' : ''}`}>
            <input type="radio" name="role" checked={value.role === r.value} onChange={() => onChange({ role: r.value })} />
            <span><strong>{r.label}</strong><br /><span className="muted small">{r.hint}</span></span>
          </label>
        ))}
      </div>
      {value.role === 'subject' && (
        <>
          <div className="muted small" style={{ margin: '12px 0 6px' }}>วิชาที่ดูแล (เลือกได้หลายวิชา)</div>
          <div className="subject-checks">
            {SUBJECTS.map((s) => (
              <label key={s.slug} className={`subject-check ${value.subjects.includes(s.slug) ? 'active' : ''}`}>
                <input type="checkbox" checked={value.subjects.includes(s.slug)} onChange={() => toggle(s.slug)} />
                {s.icon} {shortName(s)}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AccessDialog({ user, onSave, onClose }) {
  const [value, setValue] = useState({ role: user.role, subjects: user.subjects || [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError('');
    try {
      await onSave(value);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title="แก้สิทธิ์ผู้ใช้" subtitle={`${user.display_name} (${user.username})`} onClose={onClose}>
      {error && <div className="error">{error}</div>}
      <AccessFields value={value} onChange={(v) => setValue({ ...value, ...v })} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={onClose}>ยกเลิก</button>
        <button className="btn-primary" disabled={saving} onClick={save}>บันทึก</button>
      </div>
    </Modal>
  );
}
