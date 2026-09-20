'use client';

import { useRouter } from 'next/navigation';
import { useState, FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { PasswordField } from '@/components/PasswordField';

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
          <PasswordField
            id="current"
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            required
            testId="current-password"
          />

          <PasswordField
            id="next"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            minLength={8}
            required
            hint="At least 8 characters."
            testId="new-password"
          />

          <PasswordField
            id="confirm"
            label="New password again"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            required
            testId="confirm-password"
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
