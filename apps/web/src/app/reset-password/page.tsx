'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

/**
 * Choosing a new password from a link.
 *
 * The link carries the token. It is single-use and expires, so a link that has
 * been used or left too long is refused — with a message that says to ask for
 * another rather than leaving her staring at a form that will not work.
 */
function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== again) {
      setError('The two passwords are not the same.');
      return;
    }

    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      // Every session the account had open has just ended, so signing in with
      // the new password is the next step whatever device she is on.
      router.push('/login?changed=1');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not work.');
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main className="center">
        <div className="card stack">
          <h1>Choose a new password</h1>
          <p className="alert error" role="alert" data-testid="no-token">
            That link is incomplete. Open the link from your e-mail again, or ask for a new one.
          </p>
          <button onClick={() => router.push('/forgot-password')}>Ask for a new link</button>
        </div>
      </main>
    );
  }

  return (
    <main className="center">
      <div className="card">
        <h1>Choose a new password</h1>
        <p className="muted">At least 8 characters.</p>

        <form onSubmit={submit} noValidate>
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            data-testid="new-password"
          />

          <label htmlFor="again">New password again</label>
          <input
            id="again"
            type="password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            autoComplete="new-password"
            required
            data-testid="new-password-again"
          />

          {error && (
            <p className="alert error" style={{ marginTop: '1rem' }} role="alert">
              {error}
            </p>
          )}

          <button
            className="primary"
            type="submit"
            disabled={busy || password.length < 8}
            style={{ width: '100%', marginTop: '1.25rem' }}
            data-testid="save-new-password"
          >
            {busy ? 'Saving…' : 'Save my new password'}
          </button>
        </form>
      </div>
    </main>
  );
}

/** The token is in the query string, so this part renders in the browser. */
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="center">
          <p className="muted">Loading…</p>
        </main>
      }
    >
      <ResetForm />
    </Suspense>
  );
}
