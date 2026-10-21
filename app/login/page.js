'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { APP_ICON, APP_NAME } from '@/lib/brand';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [needsSetup, setNeedsSetup] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', display_name: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/auth/setup').then((d) => setNeedsSetup(d.needsSetup)).catch((e) => setError(e.message));
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(needsSetup ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: form });
      const next = params.get('next');
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand" style={{ fontSize: '1.25rem', marginBottom: 4 }}>{APP_ICON} {APP_NAME}</div>
        {needsSetup ? (
          <div className="muted small" style={{ marginBottom: 16 }}>
            ยังไม่มีผู้ใช้ในระบบ — สร้างบัญชี<strong>ผู้ดูแล</strong>คนแรก
          </div>
        ) : (
          <div className="muted small" style={{ marginBottom: 16 }}>เข้าสู่ระบบเพื่อใช้งาน</div>
        )}

        {error && <div className="error">{error}</div>}

        {needsSetup !== null && (
          <>
            {needsSetup && (
              <label className="field">
                <span>ชื่อที่แสดง (จะถูกบันทึกในประวัติคะแนน)</span>
                <input value={form.display_name} onChange={set('display_name')} placeholder="เช่น ครูสมศรี" required />
              </label>
            )}
            <label className="field">
              <span>ชื่อผู้ใช้</span>
              <input value={form.username} onChange={set('username')} autoComplete="username" autoCapitalize="none" required />
            </label>
            <label className="field">
              <span>รหัสผ่าน{needsSetup && ' (อย่างน้อย 6 ตัว)'}</span>
              <input
                type="password"
                value={form.password}
                onChange={set('password')}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                required
              />
            </label>
            <button className="btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={busy}>
              {needsSetup ? 'สร้างบัญชีและเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
