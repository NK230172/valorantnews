import type { Metadata, Viewport } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';
import LiveBar from '@/components/LiveBar';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: 'VAL Tracker',
  description: 'VALORANT 試合スケジュール & ライブスコア',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VAL Tracker',
  },
  icons: {
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#FF4655',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-val-bg text-val-text min-h-screen font-sans antialiased">
        <ServiceWorkerRegistrar />
        <NavBar />
        <main className="max-w-2xl mx-auto pb-24">
          {children}
        </main>
        <LiveBar />
      </body>
    </html>
  );
}
