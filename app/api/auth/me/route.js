import { currentStudent, currentUser } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

// ผู้ที่ล็อกอินอยู่: อาจารย์ { kind: 'user', ... } หรือนักเรียน { kind: 'student', ... }
export const GET = route(async () => {
  const user = await currentUser();
  if (user) return json({ kind: 'user', ...user });
  const student = await currentStudent();
  if (student) return json({ kind: 'student', ...student, display_name: student.name });
  return json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
});
