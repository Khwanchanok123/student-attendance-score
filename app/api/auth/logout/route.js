import { json } from '@/lib/http';
import { COOKIE } from '@/lib/session';

export async function POST() {
  const res = json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}
