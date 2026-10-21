import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter/wght.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import 'react-loading-skeleton/dist/skeleton.css';
import './globals.css';
import { ViewModeProvider } from './shared/viewMode';
import { SessionServices } from './shared/SessionServices';
import { AnnouncerProvider } from './shared/Announcer';
import { SkipLink } from './shared/SkipLink';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1a472a',
};

export const metadata: Metadata = {
  title: 'Tennis League',
  description: 'Workplace tennis league scoring, scheduling, and standings.',
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
        <SkipLink />
        {/* Push registration and the email-verification gate. Nothing else in
            this layout may import @tennis/firebase-client: it would put the
            whole SDK into every page, the public privacy policy included. */}
        <SessionServices />
        <AnnouncerProvider>
          <ViewModeProvider>{children}</ViewModeProvider>
        </AnnouncerProvider>
      </body>
    </html>
  );
}
