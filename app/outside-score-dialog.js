'use client';

import { useEffect, useState } from 'react';
import { api, formatDelta } from '@/lib/api';
import { LogList, Modal, ScoreForm } from './score-form';

// หน้าต่างเพิ่ม/ลดคะแนนนอกคลาส (นับรวมในคะแนนรวมของนักเรียน)
// student = { id, code, name }, onSaved() เรียกหลังบันทึกเพื่อให้หน้าที่เปิดโหลดคะแนนใหม่
export default function OutsideScoreDialog({ student, onSaved, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    api(`/api/students/${student.id}/scores`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [student.id]);

  async function submit(delta, reason) {
    await api(`/api/students/${student.id}/scores`, { method: 'POST', body: { delta, reason } });
    await load();
    onSaved?.();
  }

  return (
    <Modal title={student.name} subtitle={`รหัส ${student.code || '-'} · คะแนนนอกคลาส`} onClose={onClose}>
      {error && <div className="error">{error}</div>}
      <div className="score-breakdown">
        <div><div className="muted small">คะแนนจากคลาส</div><div className="big">{data ? data.class_score : '…'}</div></div>
        <div className="op">+</div>
        <div><div className="muted small">นอกคลาส</div><div className="big">{data ? formatDelta(data.outside_score) : '…'}</div></div>
        <div className="op">=</div>
        <div><div className="muted small">คะแนนรวม</div><div className="big" style={{ color: 'var(--primary)' }}>{data ? data.total_score : '…'}</div></div>
      </div>

      <ScoreForm onSubmit={submit} />

      <h3 className="small" style={{ margin: '16px 0 8px' }}>ประวัติคะแนนนอกคลาส</h3>
      <LogList logs={data?.logs} />
    </Modal>
  );
}
