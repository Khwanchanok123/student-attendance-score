import { NextResponse } from 'next/server';
import { getSubject } from './subjects';

export const json = (data, status = 200) => NextResponse.json(data, { status });

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function route(handler) {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: e.message || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' }, 500);
    }
  };
}

// ตรวจชื่อวิชาจาก request (?subject=... หรือใน body) — ไม่ถูกต้องตอบ 400
export function requireSubject(slug) {
  const subject = getSubject(slug);
  if (!subject) throw new HttpError(400, 'ไม่พบรายวิชานี้');
  return subject;
}

export const searchParam = (req, name) => new URL(req.url).searchParams.get(name);
