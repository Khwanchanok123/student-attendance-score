import { NextResponse } from 'next/server';

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
