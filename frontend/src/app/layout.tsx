import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NeuroGrid — Автоматизация маркетплейсов',
  description: 'Платформа автоматизации для продавцов WildBerries и Ozon',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-slate-50">{children}</body>
    </html>
  );
}
