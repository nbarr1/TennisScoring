import type { Metadata } from 'next';
import './globals.css';
import { FcmProvider } from './FcmProvider';
import { ViewModeProvider } from './shared/viewMode';

export const metadata: Metadata = {
  title: 'Tennis League',
  description: 'Work Tennis League Scoring & Rankings',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <FcmProvider />
        <ViewModeProvider>{children}</ViewModeProvider>
      </body>
    </html>
  );
}
