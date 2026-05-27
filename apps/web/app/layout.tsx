import type { Metadata } from 'next';
import './globals.css';
import { FcmProvider } from './FcmProvider';
import { ViewModeProvider } from './shared/viewMode';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com';

export const metadata: Metadata = {
  title: 'Tennis League',
  description: 'Work Tennis League Scoring & Rankings',
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/',
  },
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
