'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, homeFor, Me, TeacherProfile } from '@/lib/api';
import { TeacherHeader } from '@/components/TeacherShell';

/**
 * The teacher's own details.
 *
 * Her WhatsApp number lives here rather than anywhere in the platform's code.
 * Students are offered "message my teacher" only when she has set one, and
 * they are only ever sent to their own teacher's number (SRS 26).
 */
export default function TeacherSettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [title, setTitle] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then(async (user) => {
        if (user.role === 'STUDENT' || user.mustChangePassword) {
          router.replace(homeFor(user));
          return;
        }
        setMe(user);
        const mine = await api.get<TeacherProfile>('/teachers/me');
        setProfile(mine);
        setDisplayName(mine.displayName);
        setTitle(mine.title ?? '');
        setWhatsapp(mine.whatsappPhone ?? '');
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const saved = await api.patch<TeacherProfile>('/teachers/me', {
        displayName,
        title,
        whatsappPhone: whatsapp,
      });
      setProfile(saved);
      setNotice('Saved.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  if (!me || !profile) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <>
      <TeacherHeader me={me} />
    <main className="page stack">
      <div className="between">
        <h1>My details</h1>

      </div>

      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert ok" role="status">
          {notice}
        </p>
      )}

      <form className="card stack" onSubmit={save} noValidate>
        <label htmlFor="displayName">
          Your name, as students see it
          <input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            data-testid="teacher-name"
          />
        </label>

        <label htmlFor="title">
          Title
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ms, Mrs, Miss…"
            data-testid="teacher-title"
          />
        </label>

        <label htmlFor="whatsapp">
          Your WhatsApp number
          <input
            id="whatsapp"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+967 7XX XXX XXX"
            inputMode="tel"
            data-testid="teacher-whatsapp"
          />
        </label>

        <p className="muted" style={{ margin: 0 }}>
          Include the country code. Your students are offered a “message my teacher” button only
          while a number is set here, and it always goes to their own teacher — never to anyone
          else. Clear the box to take it down.
        </p>

        <div className="row">
          <button className="primary" type="submit" disabled={busy} data-testid="save-teacher">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </main>
    </>
  );
}
