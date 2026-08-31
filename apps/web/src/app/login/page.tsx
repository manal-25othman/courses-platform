'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, FormEvent } from 'react';
import { api, ApiError, homeFor, Me } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Set after a password change, which signs every device out on purpose.
  const justChanged = params.get('changed') === '1';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const result = await api.post<{ user: Me }>('/auth/login', { username, password });
      // Role and account state decide where they land.
      router.push(homeFor(result.user));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not sign in.');
      setBusy(false);
    }
  }

  return (
    <main className="center">
      <div className="card">
        <h1>Sign in</h1>
        <p className="muted">TOP GOAL</p>

        {justChanged && (
          <p className="alert ok" style={{ marginTop: '1rem' }} role="status">
            Your password was changed. Please sign in with your new password.
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />

          {error && (
            <p className="alert error" style={{ marginTop: '1rem' }} role="alert">
              {error}
            </p>
          )}

          <button
            className="primary"
            type="submit"
            disabled={busy}
            style={{ width: '100%', marginTop: '1.25rem' }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="muted" style={{ marginTop: '1.25rem' }}>
          Forgotten your password?{' '}
          <a href="/forgot-password" data-testid="forgot-link">
            Send me a reset link
          </a>
          . If your account has no e-mail address, ask your teacher to reset it for you.
        </p>
      </div>
    </main>
  );
}

/**
 * Reading the query string forces this part to render in the browser, so it
 * sits behind a boundary and the rest of the page can still be prerendered.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="center">
          <p className="muted">Loading\u2026</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
