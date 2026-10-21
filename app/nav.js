'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { APP_ICON, APP_NAME } from '@/lib/brand';

const links = [
  { href: '/', label: 'คาบเรียน' },
  { href: '/students', label: 'รายชื่อนักเรียน' },
  { href: '/summary', label: 'ตารางสรุปคะแนน' },
];

export default function Nav() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const onLogin = pathname.startsWith('/login');

  useEffect(() => {
    if (!onLogin) api('/api/auth/me').then(setUser).catch(() => setUser(null));
  }, [onLogin]);

  if (onLogin) return null;

  const isActive = (href) =>
    href === '/' ? pathname === '/' || pathname.startsWith('/sessions') : pathname.startsWith(href);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link href="/" className="brand">{APP_ICON} {APP_NAME}</Link>
        <nav className="nav">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={isActive(l.href) ? 'active' : ''}>
              {l.label}
            </Link>
          ))}
          {user?.role === 'admin' && (
            <Link href="/users" className={isActive('/users') ? 'active' : ''}>ผู้ใช้</Link>
          )}
        </nav>
        {user && (
          <div className="user-box">
            <span className="muted small">👤 {user.display_name}</span>
            <button className="btn-sm" onClick={logout}>ออกจากระบบ</button>
          </div>
        )}
      </div>
    </header>
  );
}
