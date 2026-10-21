import './globals.css';
import Nav from './nav';
import { APP_NAME } from '@/lib/brand';

export const metadata = {
  title: APP_NAME,
  description: 'เช็คชื่อเข้า-ออกและบันทึกคะแนนนักเรียนรายคาบ',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Nav />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
