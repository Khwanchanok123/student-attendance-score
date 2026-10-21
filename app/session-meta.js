import { formatDateTime } from '@/lib/api';

// เวลาแบบสั้น ไม่มีปี เช่น "21 ต.ค. 16:45"
const shortTime = (ts) =>
  ts ? new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const fullText = (s) =>
  `สร้างโดย ${s.created_by_name || '-'} · ${formatDateTime(s.created_at)}` +
  (s.updated_at ? `\nอัปเดตล่าสุดโดย ${s.updated_by_name || '-'} · ${formatDateTime(s.updated_at)}` : '');

// ใครสร้าง/อัปเดตคาบล่าสุด (คาบเก่าที่สร้างก่อนมีระบบนี้จะไม่มีชื่อผู้สร้าง)
// ปกติ: แบบกระชับสำหรับตาราง — แสดงคนล่าสุด + เวลา, บรรทัดผู้สร้างแสดงเฉพาะเมื่อเป็นคนละคน
// inline: บรรทัดเดียวใต้ชื่อคาบ
export default function SessionMeta({ session: s, inline = false }) {
  const latestName = s.updated_by_name || s.created_by_name || '-';
  const latestAt = s.updated_at || s.created_at;
  const otherCreator = s.created_by_name && s.updated_by_name && s.created_by_name !== s.updated_by_name;

  if (inline) {
    return (
      <div className="muted small session-meta" style={{ marginTop: 4 }} title={fullText(s)}>
        สร้างโดย {s.created_by_name || '-'} · {shortTime(s.created_at)}
        {s.updated_at && s.updated_at !== s.created_at && <> · อัปเดตล่าสุดโดย {latestName} · {shortTime(latestAt)}</>}
      </div>
    );
  }

  return (
    <div className="session-meta" title={fullText(s)}>
      <div style={{ whiteSpace: 'nowrap' }}>
        {latestName} <span className="muted small">· {shortTime(latestAt)}</span>
      </div>
      {otherCreator && <div className="muted small">สร้างโดย {s.created_by_name}</div>}
    </div>
  );
}
