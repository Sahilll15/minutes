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

const siteUrl = 'https://minutes-sand.vercel.app';
const title = 'Minutes: AI meeting minutes from audio, with sources';
const description =
  'Record or upload meeting audio and get minutes with a summary, decisions and action items, each linked to the moment in the transcript it came from.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: { canonical: '/' },
  title: { default: title, template: '%s | Minutes' },
  description,
  keywords: ['meeting minutes', 'AI meeting notes', 'meeting transcription', 'meeting summary', 'action items from meetings', 'meeting notes from audio', 'transcript with speaker labels'],
  applicationName: 'Minutes',
  authors: [{ name: 'Sahil Chalke', url: 'https://sahilchalke.com' }],
  creator: 'Sahil Chalke',
  openGraph: { type: 'website', siteName: 'Minutes', title, description, url: '/', locale: 'en_US' },
  twitter: { card: 'summary_large_image', creator: '@chalke1015', title, description },
  robots: { index: true, follow: true },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Minutes',
  url: siteUrl,
  description,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: {
    '@type': 'Person',
    name: 'Sahil Chalke',
    url: 'https://sahilchalke.com',
    sameAs: ['https://github.com/Sahilll15', 'https://x.com/chalke1015'],
  },
};

export const viewport: Viewport = { themeColor: '#f3f3f5' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${mono.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
        {children}
      </body>
    </html>
  );
}
