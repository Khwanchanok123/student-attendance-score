'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { APP_ICON, APP_NAME } from '@/lib/brand';

// นักเรียนสมัครบัญชีเพื่อดูคะแนนของตัวเอง
// ชื่อ IC ตรงกับรายชื่อที่อาจารย์เพิ่มไว้ = ผูกทันที / ไม่ตรง = อาจารย์ผูกให้ภายหลัง (หรือใส่รหัสผูกบัญชีจากอาจารย์)
export default function SignupPage() {
  const [showCode, setShowCode] = useState(false);
  const [form, setForm] = useState({ name: '', claim_code: '', username: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
    setBusy(true);
    setError('');
    try {
      const { confirm, ...body } = form;
      if (!showCode) body.claim_code = '';
      await api('/api/auth/signup', { method: 'POST', body });
      window.location.href = '/me';
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand" style={{ fontSize: '1.25rem', marginBottom: 4 }}>{APP_ICON} {APP_NAME}</div>
        <div className="muted small" style={{ marginBottom: 16 }}>สมัครบัญชีนักเรียน เพื่อดูคะแนนของตัวเอง</div>

        {error && <div className="error">{error}</div>}

        <label className="field">
          <span>ชื่อ IC</span>
          <input value={form.name} onChange={set('name')} placeholder="ชื่อตัวละครของคุณ" required autoFocus />
        </label>
        <div className="muted small" style={{ marginTop: -6, marginBottom: 12 }}>
          พิมพ์ให้ตรงกับที่อาจารย์เรียก ระบบจะดึงคะแนนของคุณมาให้อัตโนมัติ
        </div>

        <label className="field">
          <span>ชื่อผู้ใช้ (ภาษาอังกฤษ/ตัวเลข)</span>
          <input value={form.username} onChange={set('username')} autoComplete="username" autoCapitalize="none" required />
        </label>
        <label className="field">
          <span>รหัสผ่าน (อย่างน้อย 6 ตัว)</span>
          <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />
        </label>
        <label className="field">
          <span>ยืนยันรหัสผ่าน</span>
          <input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
        </label>

        {showCode ? (
          <label className="field">
            <span>รหัสผูกบัญชีจากอาจารย์</span>
            <input value={form.claim_code} onChange={set('claim_code')} placeholder="เช่น K7P-29Q" autoCapitalize="characters"
              style={{ fontFamily: 'monospace', letterSpacing: 2 }} />
          </label>
        ) : (
          <div className="small" style={{ marginBottom: 10 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setShowCode(true); }}>มีรหัสผูกบัญชีจากอาจารย์?</a>
          </div>
        )}

        <button className="btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={busy}>สมัครและเข้าสู่ระบบ</button>
        <div className="muted small" style={{ textAlign: 'center', marginTop: 14 }}>
          มีบัญชีแล้ว? <Link href="/login">เข้าสู่ระบบ</Link>
        </div>
      </form>
    </div>
  );
}
