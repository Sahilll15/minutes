import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Manrope } from 'next/font/google';
import { APP_ID, PERSON_ID, SITE_URL, WEBSITE_ID } from '@/lib/seo';
import { JsonLd } from './components/JsonLd';
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

const siteUrl = SITE_URL;
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
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: 'Minutes',
      url: siteUrl,
      description,
      inLanguage: 'en',
      publisher: { '@id': PERSON_ID },
      author: { '@id': PERSON_ID },
    },
    {
      '@type': 'WebApplication',
      '@id': APP_ID,
      name: 'Minutes',
      url: siteUrl,
      description,
      isPartOf: { '@id': WEBSITE_ID },
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      screenshot: `${siteUrl}/opengraph-image.png`,
      featureList: [
        'Record in the browser or upload an audio file up to 4 MB',
        'Transcript with speaker labels',
        'Summary, decisions, action items, open questions and risks',
        'Every item links to the transcript lines it came from',
        'Follow-up email draft, Markdown and calendar (.ics) export',
      ],
      author: { '@id': PERSON_ID },
    },
    {
      '@type': 'Person',
      '@id': PERSON_ID,
      name: 'Sahil Chalke',
      url: 'https://sahilchalke.com',
      sameAs: ['https://github.com/Sahilll15', 'https://x.com/chalke1015'],
    },
  ],
};

export const viewport: Viewport = { themeColor: '#f3f3f5' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${mono.variable}`}>
      <body>
        <JsonLd data={jsonLd} />
        {children}
      </body>
    </html>
  );
}
