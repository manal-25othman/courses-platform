import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'TOP GOAL',
  description: 'Interactive English Learning Platform',
};

/**
 * The interface language is English for every role (SRS 39), so the document
 * language is fixed to English and the direction to left-to-right. Arabic
 * appears only inside educational content, which will set its own direction
 * per field rather than per page (ARCHITECTURE 27).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
