'use client';

import { useRouter } from 'next/navigation';
import { useState, FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';

/**
 * Where a temporary password is replaced (SRS 28.6.2).
 *
 * Changing a password ends every session, so the user signs in again
 * afterwards with the new one.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      router.push('/login?changed=1');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not change your password.');
      setBusy(false);
    }
  }

  return (
    <main className="center">
      <div className="card">
        <h1>Choose your password</h1>
        <p className="muted">
          Your current password was set for you, so please replace it with one only you know.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="current">Current password</label>
          <input
            id="current"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <label htmlFor="next">New password</label>
          <input
            id="next"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="muted">At least 8 characters.</p>

          <label htmlFor="confirm">New password again</label>
          <input
            id="confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
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
            {busy ? 'Saving…' : 'Save my password'}
          </button>
        </form>
      </div>
    </main>
  );
}
