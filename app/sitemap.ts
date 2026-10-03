import type { MetadataRoute } from 'next';

const base = 'https://minutes-sand.vercel.app';

// Bump a date only when that page's content changes.
const UPDATED = { home: '2026-10-04', howItWorks: '2026-10-04' };

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${base}/`, lastModified: UPDATED.home, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/how-it-works`, lastModified: UPDATED.howItWorks, changeFrequency: 'monthly', priority: 0.8 },
  ];
}
