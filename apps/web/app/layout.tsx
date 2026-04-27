import type { Metadata } from 'next';
import './globals.css';
import { FcmProvider } from './FcmProvider';

export const metadata: Metadata = {
  title: 'Tennis League',
  description: 'Work Tennis League Scoring & Rankings',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <FcmProvider />
        {children}
      </body>
    </html>
  );
}
