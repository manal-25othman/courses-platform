'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, homeFor, Me } from '@/lib/api';

/**
 * Where a student lands after signing in.
 *
 * Her units, vocabulary and activities are built in later phases. Until then
 * this confirms she is signed in rather than showing her a screen meant for
 * her teacher.
 */
export default function StudentHomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((user) => {
        // A teacher who lands here is sent to her own page, and vice versa.
        if (user.role !== 'STUDENT') {
          router.replace(homeFor(user));
          return;
        }
        if (user.mustChangePassword) {
          router.replace('/change-password');
          return;
        }
        setMe(user);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  async function signOut() {
    await api.post('/auth/logout').catch(() => undefined);
    router.push('/login');
  }

  if (!me) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="page stack">
      <div className="between">
        <div>
          <h1>Hello, {me.displayName}</h1>
          <p className="muted">TOP GOAL</p>
        </div>
        <button onClick={signOut}>Sign out</button>
      </div>

      <div className="card">
        <h2>Your lessons are coming soon</h2>
        <p className="muted">
          Your teacher is setting up your units. When they are ready, your vocabulary, grammar and
          activities will appear here.
        </p>
      </div>

      <div className="card">
        <h2>Your account</h2>
        <p className="muted">
          Signed in as <strong>{me.username}</strong>.
        </p>
        <div className="row" style={{ marginTop: '.75rem' }}>
          <button onClick={() => router.push('/change-password')}>Change my password</button>
        </div>
        <p className="muted" style={{ marginTop: '.75rem' }}>
          Forgotten your password? Ask your teacher to reset it for you.
        </p>
      </div>
    </main>
  );
}
