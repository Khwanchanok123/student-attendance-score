'use client';

import { useState } from 'react';
import { api, formatDateTime } from '@/lib/api';
import StudentPicker from './student-picker';

// บัญชีนักเรียน (ในหน้านักเรียนของอาจารย์): รหัสผูกบัญชี / ตั้งรหัสผ่านใหม่ / ยกเลิกการผูก / รวมนักเรียนซ้ำ
export default function StudentAccount({ subject, student, onChange }) {
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  const [merging, setMerging] = useState(false);
  const base = `/api/students/${student.id}`;

  async function run(fn, done) {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (done) { setFlash(done); setTimeout(() => setFlash(''), 3000); }
      await onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const newCode = () => {
    if (student.claim_code && !confirm('สร้างรหัสใหม่? รหัสเดิมจะใช้ไม่ได้อีก')) return;
    run(() => api(`${base}/account`, { method: 'POST', body: { subject: subject?.slug, action: 'code' } }));
  };
  const resetPassword = () => {
    const password = prompt(`ตั้งรหัสผ่านใหม่ให้ ${student.name} (อย่างน้อย 6 ตัว)`);
    if (!password) return;
    run(() => api(`${base}/account`, { method: 'POST', body: { subject: subject?.slug, action: 'password', password } }), 'ตั้งรหัสผ่านใหม่แล้ว');
  };
  const unlink = () => {
    if (!confirm(`ยกเลิกบัญชี "${student.account_username}"? นักเรียนจะล็อกอินไม่ได้ (คะแนนยังอยู่ครบ)`)) return;
    run(() => api(`${base}/account${subject ? `?subject=${subject.slug}` : ''}`, { method: 'DELETE' }), 'ยกเลิกบัญชีแล้ว');
  };
  const merge = async ({ student: other }) => {
    if (!confirm(`รวม "${other.name}" เข้ากับ "${student.name}"?\n\nคาบเรียน คะแนน ประวัติ และบัญชีของ ${other.name} จะย้ายมาที่ ${student.name} ทั้งหมด แล้วลบ ${other.name} ออก — ย้อนกลับไม่ได้`)) {
      throw new Error('ยกเลิกการรวม');
    }
    await api(`${base}/merge`, { method: 'POST', body: { subject: subject?.slug, other_id: other.id } });
    setMerging(false);
    await onChange();
    return `รวม ${other.name} แล้ว`;
  };

  return (
    <div className="card account-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>🎓 บัญชีนักเรียน</h2>
        <button className="btn-sm" onClick={() => setMerging(!merging)}>{merging ? 'ปิด' : '🔗 รวมนักเรียนซ้ำ'}</button>
      </div>
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      {flash && <div className="flash">{flash}</div>}

      <div style={{ marginTop: 10 }}>
        {student.account_username ? (
          <div className="row">
            <span className="pill pill-ok">มีบัญชีแล้ว</span>
            <span>ชื่อผู้ใช้ <strong>{student.account_username}</strong></span>
            <span className="muted small">สมัครเมื่อ {formatDateTime(student.account_created_at)}</span>
            {student.self_registered && <span className="pill pill-none">สมัครเอง</span>}
            <span className="grow" />
            <button className="btn-sm" disabled={busy} onClick={resetPassword}>ตั้งรหัสผ่านใหม่</button>
            <button className="btn-sm btn-danger" disabled={busy} onClick={unlink}>ยกเลิกบัญชี</button>
          </div>
        ) : student.claim_code ? (
          <div className="row">
            <span className="muted">รหัสผูกบัญชี</span>
            <code className="claim-code">{student.claim_code}</code>
            <button className="btn-sm" onClick={() => navigator.clipboard?.writeText(student.claim_code).then(() => { setFlash('คัดลอกแล้ว'); setTimeout(() => setFlash(''), 1500); })}>คัดลอก</button>
            <button className="btn-sm" disabled={busy} onClick={newCode}>สร้างใหม่</button>
            <div className="muted small" style={{ width: '100%' }}>
              ให้นักเรียนไปที่หน้า "สมัคร" แล้วใส่รหัสนี้ (หรือใส่ในหน้าคะแนนของฉัน ถ้าสมัครไว้แล้ว) ใช้ได้ครั้งเดียว
            </div>
          </div>
        ) : (
          <div className="row">
            <span className="muted">ยังไม่มีบัญชี</span>
            <button className="btn-sm btn-primary" disabled={busy} onClick={newCode}>สร้างรหัสผูกบัญชี</button>
          </div>
        )}
      </div>

      {merging && (
        <div style={{ marginTop: 14 }}>
          <div className="muted small" style={{ marginBottom: 6 }}>
            เลือกรายชื่อที่ซ้ำกับ <strong>{student.name}</strong> — ข้อมูลทั้งหมดของคนที่เลือกจะย้ายมาที่คนนี้ แล้วรายชื่อที่เลือกจะถูกลบ
          </div>
          <StudentPicker
            subject={subject}
            allowNew={false}
            placeholder="🔍 ค้นหารายชื่อที่ซ้ำ..."
            isDisabled={(s) => (s.id === student.id ? 'คนนี้' : null)}
            onPick={merge}
            onError={(m) => m !== 'ยกเลิกการรวม' && setError(m)}
          />
        </div>
      )}
    </div>
  );
}
