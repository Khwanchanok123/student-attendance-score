'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { APP_ICON, APP_NAME } from '@/lib/brand';
import { roleInfo, visibleSubjects } from '@/lib/roles';
import { shortName, subjectPath } from '@/lib/subjects';

export default function Nav() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const onLogin = pathname.startsWith('/login') || pathname.startsWith('/signup');

  useEffect(() => {
    if (!onLogin) api('/api/auth/me').then(setUser).catch(() => setUser(null));
  }, [onLogin]);

  if (onLogin) return null;
  const isStudent = user?.kind === 'student';

  const isActive = (href) => pathname === href || pathname.startsWith(`${href}/`);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link href={isStudent ? '/me' : '/'} className="brand">{APP_ICON} {APP_NAME}</Link>
        {isStudent && (
          <div className="user-box">
            <span className="muted small">🎓 {user.display_name}</span>
            <button className="btn-sm" onClick={logout}>ออกจากระบบ</button>
          </div>
        )}
        {user && !isStudent && (
          <div className="user-box">
            <Link href="/students" className={`btn btn-sm ${isActive('/students') ? 'btn-primary' : ''}`}>🗂 นักเรียนทั้งหมด</Link>
            {user.role === 'admin' && (
              <Link href="/users" className={`btn btn-sm ${isActive('/users') ? 'btn-primary' : ''}`}>👥 ผู้ใช้</Link>
            )}
            <Link href="/settings" className={`btn btn-sm ${isActive('/settings') ? 'btn-primary' : ''}`}>⚙ ตั้งค่า</Link>
            <span className="muted small" title={roleInfo(user.role).label}>👤 {user.display_name}</span>
            <button className="btn-sm" onClick={logout}>ออกจากระบบ</button>
          </div>
        )}
      </div>
      {!isStudent && <nav className="subject-bar" aria-label="รายวิชา">
        <div className="container subject-tabs">
          {visibleSubjects(user).map((s) => (
            <Link key={s.slug} href={subjectPath(s)} className={isActive(subjectPath(s)) ? 'active' : ''} title={s.name}>
              <span aria-hidden="true">{s.icon}</span> {shortName(s)}
            </Link>
          ))}
        </div>
      </nav>}
    </header>
  );
}
