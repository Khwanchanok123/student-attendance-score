import { NextResponse } from 'next/server';
import { COOKIE, verifySession } from '@/lib/session';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/setup'];

// ทุกหน้าต้องล็อกอินก่อน ยกเว้นหน้าล็อกอิน
export async function middleware(req) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;
  if (token && (await verifySession(token))) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
