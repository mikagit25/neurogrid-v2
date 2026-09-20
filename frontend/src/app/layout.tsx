import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NeuroGrid — Автоматизация маркетплейсов',
  description: 'Управление WildBerries, Ozon, Яндекс Маркет и Мегамаркет в одном месте',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NeuroGrid',
    startupImage: '/icons/icon-512x512.png',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'msapplication-TileColor': '#7c3aed',
    'msapplication-TileImage': '/icons/icon-144x144.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#7c3aed',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        <meta name="application-name" content="NeuroGrid" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="NeuroGrid" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192x192.png" />
        <link rel="shortcut icon" href="/icons/icon-192x192.png" />
      </head>
      <body className="min-h-screen bg-slate-50">{children}</body>
    </html>
  );
}
