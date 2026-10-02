import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-manrope',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'Minutes',
  description: 'Record or upload a meeting and get minutes where every decision and action item links back to the moment it was said.',
};

export const viewport: Viewport = { themeColor: '#f3f3f5' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
