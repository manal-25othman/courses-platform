'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, homeFor, LearnUnitSummary, Me } from '@/lib/api';

/**
 * Where a student starts: her units, and how far she has got with each.
 *
 * Only units her teacher has approved appear here. That is not a filter this
 * page applies — the API returns published units only, so unapproved material
 * is not something the page has to remember to hide.
 */
export default function StudentHomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [units, setUnits] = useState<LearnUnitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((user) => {
        if (user.role !== 'STUDENT' || user.mustChangePassword) {
          router.replace(homeFor(user));
          return;
        }
        setMe(user);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  useEffect(() => {
    if (!me) return;
    api
      .get<LearnUnitSummary[]>('/learn/units')
      .then(setUnits)
      .catch((caught) => {
        setUnits([]);
        setError(caught instanceof ApiError ? caught.message : 'Could not load your units.');
      });
  }, [me]);

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

      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      <h2 style={{ margin: 0 }}>Your units</h2>

      {units === null ? (
        <p className="muted">Loading your units…</p>
      ) : units.length === 0 ? (
        <div className="card">
          <h2>Nothing to do just yet</h2>
          <p className="muted">
            Your teacher is still preparing your units. They will appear here as soon as she is
            ready.
          </p>
        </div>
      ) : (
        <div className="grid" data-testid="unit-grid">
          {units.map((unit) => (
            <button
              key={unit.id}
              className="card stack"
              data-testid="unit-card"
              onClick={() => router.push(`/learn/${unit.id}`)}
              style={{ textAlign: 'left', cursor: 'pointer' }}
            >
              <div className="between">
                <strong style={{ fontSize: '1.05rem' }}>{unit.title}</strong>
                {unit.progress.isComplete && <span className="badge active">Finished</span>}
              </div>

              <div>
                <div className="meter" aria-hidden="true">
                  <span style={{ width: `${unit.progress.overallPercent}%` }} />
                </div>
                <p className="muted" style={{ marginTop: '.4rem' }}>
                  {unit.progress.overallPercent}% done
                </p>
              </div>

              <p className="muted" style={{ margin: 0 }}>
                Words {unit.progress.vocabulary.done}/{unit.progress.vocabulary.total} · Activity{' '}
                {unit.progress.bestScorePercent === null
                  ? 'not tried'
                  : `best ${unit.progress.bestScorePercent}%`}
              </p>
            </button>
          ))}
        </div>
      )}

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
