import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VAL Tracker',
    short_name: 'VAL',
    description: 'VALORANT 試合スケジュール & ライブスコア',
    start_url: '/',
    display: 'standalone',
    background_color: '#0F1923',
    theme_color: '#FF4655',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
