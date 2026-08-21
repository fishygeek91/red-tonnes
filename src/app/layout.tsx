import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'RED TONNES — Mars city simulator',
  description:
    'A first-principles Mars city simulator: landed tonnes, ISRU methalox, greenhouse streets, compost loops. The planet stays red; the city para-terraforms.',
  // Share permalinks (#r=...) unfurl with this card on social platforms; the
  // fragment itself never reaches the server, so the card is run-agnostic.
  openGraph: {
    title: 'RED TONNES — Mars city simulator',
    description:
      'Someone shared a Mars city run with you. Watch the exact replay, scrub the timeline, then take over and beat it. Same seed, same storms.',
    type: 'website',
    siteName: 'RED TONNES',
  },
  twitter: {
    card: 'summary',
    title: 'RED TONNES — Mars city simulator',
    description:
      'Watch the exact replay of a shared Mars city run, then take over and beat it. Same seed, same storms.',
  },
};

/** Phone-first viewport: cover the notch / home indicator so the dock can pad. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** Root layout: dark industrial shell, no scroll, fonts wired to CSS vars. */
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-dvh w-screen overflow-hidden">{children}</body>
    </html>
  );
}
