import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Corpus Search',
  description: 'Semantic search and grounded answers over the internal document corpus.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
