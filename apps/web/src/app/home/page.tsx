'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, homeFor, LearnUnitSummary, Me, MyTeacher } from '@/lib/api';
import { Conversation } from '@/components/Conversation';

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
  const [teacher, setTeacher] = useState<MyTeacher | null>(null);

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

    // Her own teacher, and only if that teacher has set a number. Not having
    // one is ordinary, so a failure here changes nothing on the page.
    api
      .get<MyTeacher | null>('/teachers/mine')
      .then(setTeacher)
      .catch(() => setTeacher(null));
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

              {/*
                The four parts, each read from what she has actually recorded.
                Nothing here is something she can set herself: there is no
                "mark this unit done". A dash means the teacher has not added
                that part yet, which is why the unit cannot reach 100%.
              */}
              <dl className="parts" data-testid="unit-parts">
                <div>
                  <dt>Words</dt>
                  <dd data-testid="part-vocabulary">
                    {unit.progress.vocabulary.empty
                      ? '—'
                      : `${unit.progress.vocabulary.done}/${unit.progress.vocabulary.total}`}
                  </dd>
                </div>
                <div>
                  <dt>Grammar</dt>
                  <dd data-testid="part-grammar">
                    {unit.progress.grammar.empty
                      ? '—'
                      : `${unit.progress.grammar.done}/${unit.progress.grammar.total}`}
                  </dd>
                </div>
                <div>
                  <dt>Activity</dt>
                  <dd data-testid="part-activity">
                    {unit.progress.activity.empty
                      ? '—'
                      : unit.progress.bestScorePercent === null
                        ? 'not tried'
                        : `${unit.progress.bestScorePercent}%`}
                  </dd>
                </div>
                <div>
                  <dt>Assessment</dt>
                  <dd data-testid="part-assessment">
                    {unit.progress.assessment.empty
                      ? '—'
                      : unit.progress.assessmentState.passed
                        ? 'passed'
                        : `${unit.progress.assessmentState.attemptsUsed} of ${
                            unit.progress.assessmentState.maxAttempts ?? '∞'
                          } tries`}
                  </dd>
                </div>
              </dl>

              {unit.progress.missingContent.length > 0 && (
                <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>
                  Not ready yet — your teacher is still preparing part of this unit.
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      <Conversation
        loadPath="/messages/mine"
        sendPath="/messages/mine"
        readPath="/messages/mine/read"
        placeholder="Write to your teacher…"
        emptyText="No messages yet. Your teacher will write here when she has something for you."
      />

      {/*
        Offered only while her own teacher has a number set. There is no
        number anywhere in this platform's code: with none set, the button is
        simply not here (SRS 26).
      */}
      {teacher?.whatsappUrl && (
        <div className="card">
          <h2>Ask your teacher</h2>
          <p className="muted">
            Message {teacher.title ? `${teacher.title} ` : ''}
            {teacher.displayName} on WhatsApp if you are stuck on something.
          </p>
          <div className="row" style={{ marginTop: '.75rem' }}>
            <a
              className="button-link"
              href={`${teacher.whatsappUrl}?text=${encodeURIComponent(
                `Hello, this is ${me.displayName} from TOP GOAL.`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="contact-teacher-whatsapp"
            >
              Message my teacher on WhatsApp
            </a>
          </div>
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
          Forgotten your password?{' '}
          <a href="/forgot-password">Send a reset link to your e-mail</a>, or ask your teacher to
          reset it for you.
        </p>
      </div>
    </main>
  );
}
