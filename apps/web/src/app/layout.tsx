import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import { getDictionary, DEFAULT_LOCALE, dirFor } from '@/lib/i18n';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-arabic',
  display: 'swap',
});

const dict = getDictionary(DEFAULT_LOCALE);

export const metadata: Metadata = {
  title: dict.meta.title,
  description: dict.meta.description,
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // lang/dir are updated on the client by ChatApp when the user switches locale.
  return (
    <html lang={DEFAULT_LOCALE} dir={dirFor(DEFAULT_LOCALE)} className={`${inter.variable} ${plexArabic.variable}`}>
      <body>{children}</body>
    </html>
  );
}
