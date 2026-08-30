'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api, homeFor, Me } from '@/lib/api';

/** Sends the visitor wherever they belong, by role and account state. */
export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((me) => router.replace(homeFor(me)))
      .catch(() => router.replace('/login'));
  }, [router]);

  return (
    <main className="center">
      <p className="muted">Loading\u2026</p>
    </main>
  );
}
