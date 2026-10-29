import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// The kit's typeface; self-hosted by Next.js at build time (no request to Google from operators' browsers).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'Dukaan Saathi Admin', template: '%s · Dukaan Saathi Admin' },
  description: 'Platform operations for Dukaan Saathi',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-page font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
