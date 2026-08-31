'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

/**
 * Asking for a reset link.
 *
 * The message afterwards is the same whatever was typed, because the API
 * answers the same way whatever was typed: saying "no account with that
 * address" would be a way to find out which of a school's teachers is
 * registered, and, given a list of names, which children are.
 *
 * Students who have no address of their own are told where to go instead, so
 * a child does not sit here typing addresses that were never registered.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    // The API answers the same way for every address, so there is nothing a
    // failure here could usefully say. It is swallowed on purpose.
    await api.post('/auth/forgot-password', { email }).catch(() => undefined);
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <main className="center">
        <div className="card stack">
          <h1>Check your e-mail</h1>
          <p className="alert ok" role="status" data-testid="reset-sent">
            If that address has an account, a link to choose a new password is on its way. It
            stops working after an hour and can only be used once.
          </p>
          <p className="muted">
            Nothing arrived? Check the spelling of the address, and look in your spam folder.
          </p>
          <button onClick={() => router.push('/login')}>Back to sign in</button>
        </div>
      </main>
    );
  }

  return (
    <main className="center">
      <div className="card">
        <h1>Forgotten password</h1>
        <p className="muted">Enter the e-mail address on your account.</p>

        <form onSubmit={submit} noValidate>
          <label htmlFor="email">E-mail address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            required
            data-testid="forgot-email"
          />

          <button
            className="primary"
            type="submit"
            disabled={busy || email.trim() === ''}
            style={{ width: '100%', marginTop: '1.25rem' }}
            data-testid="send-reset"
          >
            {busy ? 'Sending…' : 'Send me a link'}
          </button>
        </form>

        <p className="muted" style={{ marginTop: '1.25rem' }}>
          No e-mail address on your account? Ask your teacher to reset your password for you.
        </p>

        <button onClick={() => router.push('/login')} style={{ marginTop: '.5rem' }}>
          Back to sign in
        </button>
      </div>
    </main>
  );
}
