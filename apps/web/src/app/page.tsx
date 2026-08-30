'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api, Me } from '@/lib/api';

/** Sends the visitor wherever they belong, depending on whether they are signed in. */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((me) => router.replace(me.mustChangePassword ? '/change-password' : '/students'))
      .catch(() => router.replace('/login'));
  }, [router]);

  return (
    <main className="center">
      <p className="muted">Loading…</p>
    </main>
  );
}
