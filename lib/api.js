// ตัวช่วยเรียก API ฝั่งหน้าเว็บ
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !window.location.pathname.startsWith('/login')) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

export function formatDate(d) {
  if (!d) return '';
  return new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function formatDelta(n) {
  return n > 0 ? `+${n}` : String(n);
}

export function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// แยก "รหัส ชื่อ" ถ้าคำแรกมีตัวเลข ไม่งั้นถือว่าทั้งบรรทัดคือชื่อ
export function parseStudentLine(line) {
  const text = String(line || '').trim();
  const m = text.match(/^(\S*\d\S*)\s+(.+)$/);
  return m ? { code: m[1], name: m[2].trim() } : { code: '', name: text };
}
