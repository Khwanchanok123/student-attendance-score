import { formatDateTime } from '@/lib/api';

// ใครสร้าง/อัปเดตคาบล่าสุด และเวลา (คาบเก่าที่สร้างก่อนมีระบบนี้จะไม่มีชื่อผู้สร้าง)
export default function SessionMeta({ session, inline = false }) {
  const created = (
    <span>
      สร้างโดย <strong>{session.created_by_name || '-'}</strong> · {formatDateTime(session.created_at)}
    </span>
  );
  const updated = session.updated_at && (
    <span>
      อัปเดตล่าสุดโดย <strong>{session.updated_by_name || '-'}</strong> · {formatDateTime(session.updated_at)}
    </span>
  );

  if (inline) {
    return <div className="muted small session-meta">{created}{updated && <> · {updated}</>}</div>;
  }
  return (
    <div className="muted small session-meta">
      <div>{created}</div>
      {updated && <div>{updated}</div>}
    </div>
  );
}
