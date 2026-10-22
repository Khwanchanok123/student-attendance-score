import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  serverExternalPackages: ['@electric-sql/pglite'],
  // ลิงก์เก่าก่อนแยกรายวิชา (ข้อมูลเดิมทั้งหมดเป็นวิชาพยากรณ์ศาสตร์)
  // /students ตอนนี้เป็นหน้ารายชื่อนักเรียนกลาง
  async redirects() {
    return [
      { source: '/sessions/:id', destination: '/s/divination/sessions/:id', permanent: false },
      { source: '/summary', destination: '/s/divination/summary', permanent: false },
    ];
  },
};

export default nextConfig;
