import { NextResponse } from 'next/server';
import { COOKIE, verifySession } from '@/lib/session';

const PUBLIC_PATHS = ['/login', '/signup', '/api/auth/login', '/api/auth/setup', '/api/auth/signup'];
// บัญชีนักเรียนเข้าได้เฉพาะหน้าคะแนนของตัวเอง
const STUDENT_PATHS = ['/me', '/api/me', '/api/auth'];
const STUDENT_HOME = '/me';

const under = (pathname, base) => pathname === base || pathname.startsWith(`${base}/`);

// ทุกหน้าต้องล็อกอินก่อน ยกเว้นหน้าล็อกอิน/สมัคร
export async function middleware(req) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;
  const session = token && (await verifySession(token));
  if (session) {
    const studentOnly = under(pathname, '/me') || under(pathname, '/api/me');
    if (session.kind === 'student' && !STUDENT_PATHS.some((p) => under(pathname, p))) {
      if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'บัญชีนักเรียนใช้ส่วนนี้ไม่ได้' }, { status: 403 });
      return redirectTo(req, STUDENT_HOME);
    }
    if (session.kind === 'user' && studentOnly) {
      if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'สำหรับบัญชีนักเรียนเท่านั้น' }, { status: 403 });
      return redirectTo(req, '/');
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

function redirectTo(req, pathname) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
