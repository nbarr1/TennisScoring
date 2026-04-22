import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tennis League',
  description: 'Work Tennis League Scoring & Rankings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
