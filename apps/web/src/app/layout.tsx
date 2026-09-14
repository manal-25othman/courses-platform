import type { Metadata } from 'next';
import './globals.css';
import type { ReactNode } from 'react';
import { IdleGuard } from '@/components/IdleGuard';

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
      <body>
        {children}
        {/*
          Mounted once, above every screen, rather than per page: a guard that
          has to be remembered on each new route is a guard that will be
          missed on one. It decides for itself which routes are behind a
          session and does nothing on the rest.
        */}
        <IdleGuard />
      </body>
    </html>
  );
}
