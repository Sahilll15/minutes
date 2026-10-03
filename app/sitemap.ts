import type { MetadataRoute } from 'next';

const base = 'https://minutes-sand.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${base}/`, changeFrequency: 'monthly', priority: 1 },
  ];
}
