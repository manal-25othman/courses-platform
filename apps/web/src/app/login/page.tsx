'use client';

import { useRouter } from 'next/navigation';
import { useState, FormEvent } from 'react';
import { api, ApiError, Me } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
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
      // A password the teacher set is temporary, so she chooses her own first.
      router.push(result.user.mustChangePassword ? '/change-password' : '/students');
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
          Forgotten your password? Ask your teacher to reset it for you.
        </p>
      </div>
    </main>
  );
}
