'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

/**
 * Signing out someone who has walked away.
 *
 * This is not token expiry, and the difference matters. An access token
 * expires on a clock and is renewed silently while the tab is open, which is
 * what keeps a teacher who is working from being interrupted. Inactivity is
 * about the other case: a shared staffroom machine, or a tablet left on a desk
 * in a classroom of eleven-year-olds, with a register still on screen.
 *
 * Three rules shape it:
 *
 *   Nobody is signed out without being asked. The warning comes first, with a
 *   countdown and a button, because losing half-written feedback to a silent
 *   timeout is worse than the risk it avoids.
 *
 *   Real activity counts, a beating clock does not. The timer is reset by
 *   things a person does — a key, a pointer, a scroll, a touch — and never by
 *   a poll or a background refresh, which would keep an empty room signed in
 *   for ever.
 *
 *   All tabs agree. Two tabs of the same account share one last-active time
 *   through localStorage, so working in one keeps the other alive and signing
 *   out in one takes the other with it.
 */

/**
 * How long before the warning appears.
 *
 * Twenty minutes: comfortably longer than reading a page of grammar or writing
 * a message to a parent, and short enough that a machine left at the end of a
 * lesson is not still signed in at the start of the next one. Within the
 * 15-30 the client asked for, at the length that interrupts real work least.
 */
const IDLE_MINUTES = 20;

/** How long the warning stands before the session ends. */
const WARN_SECONDS = 60;

/** Where the last real activity, for any tab of this browser, is recorded. */
const STAMP_KEY = 'topgoal.lastActive';

/** Screens that are not behind a session, so there is nothing to guard. */
const PUBLIC = ['/login', '/forgot-password', '/reset-password', '/'];

/**
 * The events that count as somebody being there.
 *
 * `visibilitychange` is deliberately absent: a tab becoming visible because a
 * screen woke up is not a person, and treating it as one is how an unattended
 * machine stays signed in.
 */
const ACTIVITY = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;

export function IdleGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  /** Set while signing out, so a slow request cannot start a second one. */
  const leaving = useRef(false);

  const guarded = !PUBLIC.includes(pathname) && !pathname.startsWith('/reset-password');

  const stamp = useCallback(() => {
    try {
      localStorage.setItem(STAMP_KEY, String(Date.now()));
    } catch {
      // A browser refusing storage still gets the timeout, just per-tab.
    }
  }, []);

  const lastActive = useCallback((): number => {
    try {
      const raw = Number(localStorage.getItem(STAMP_KEY));
      return Number.isFinite(raw) && raw > 0 ? raw : Date.now();
    } catch {
      return Date.now();
    }
  }, []);

  const signOut = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    // The cookie is cleared server-side; the redirect carries the reason so
    // the sign-in screen can say what happened rather than just appearing.
    await api.post('/auth/logout').catch(() => undefined);
    router.replace('/login?reason=inactive');
  }, [router]);

  const stayIn = useCallback(() => {
    stamp();
    setSecondsLeft(null);
  }, [stamp]);

  /*
    Whether the warning is up, readable without being a dependency.

    This is a ref and not the state itself for a reason worth keeping: the
    listener below needs to know, and if it depended on the state then setting
    the state would re-run the effect — which would re-stamp, cancel the
    countdown, and produce a guard that can never sign anybody out. It did
    exactly that until a browser test caught it.
  */
  const warning = useRef(false);
  warning.current = secondsLeft !== null;

  // --- opening a guarded page is itself activity --------------------------
  useEffect(() => {
    // Also what stops a stale stamp from an earlier session ending this one
    // the moment it starts.
    if (guarded) stamp();
  }, [guarded, stamp]);

  // --- watch for activity ------------------------------------------------
  useEffect(() => {
    if (!guarded) return;

    const onActivity = () => {
      // While the warning is up, only the button dismisses it. A stray scroll
      // must not silently cancel a countdown the person never saw.
      if (warning.current) return;
      stamp();
    };

    for (const event of ACTIVITY) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    return () => {
      for (const event of ACTIVITY) window.removeEventListener(event, onActivity);
    };
  }, [guarded, stamp]);

  // --- the clock ---------------------------------------------------------
  useEffect(() => {
    if (!guarded) {
      setSecondsLeft(null);
      return;
    }

    /*
      One second is fine here: it is a comparison of two numbers, not a
      request, and it keeps the countdown honest on a machine that slept —
      waking to find the deadline long past signs out at once rather than
      counting down from sixty as though nothing had happened.
    */
    const tick = window.setInterval(() => {
      const idleFor = Date.now() - lastActive();
      const warnAt = IDLE_MINUTES * 60_000;
      const endAt = warnAt + WARN_SECONDS * 1000;

      if (idleFor >= endAt) {
        void signOut();
        return;
      }
      setSecondsLeft(idleFor >= warnAt ? Math.ceil((endAt - idleFor) / 1000) : null);
    }, 1000);

    return () => window.clearInterval(tick);
  }, [guarded, lastActive, signOut]);

  // --- another tab said something ---------------------------------------
  useEffect(() => {
    if (!guarded) return;
    const onStorage = (event: StorageEvent) => {
      // Activity in a sibling tab is activity here too: the next tick reads
      // the shared stamp, so the warning simply goes away.
      if (event.key === STAMP_KEY) setSecondsLeft(null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [guarded]);

  if (!guarded || secondsLeft === null) return null;

  return (
    <div className="idle-veil" role="presentation">
      <div
        className="idle-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-body"
        data-testid="idle-warning"
      >
        <strong id="idle-title" className="idle-title">
          Are you still there?
        </strong>
        <p id="idle-body" className="idle-body">
          You have not done anything for a while, so we will sign you out in{' '}
          {/* Spoken as well as shown: a countdown nobody is told about is a
              surprise rather than a warning. */}
          <b data-testid="idle-countdown">{secondsLeft}</b>{' '}
          {secondsLeft === 1 ? 'second' : 'seconds'} to keep your account safe.
        </p>
        <span role="status" aria-live="polite" className="sr-only">
          Signing out in {secondsLeft} {secondsLeft === 1 ? 'second' : 'seconds'}.
        </span>
        <div className="idle-row">
          <button className="primary" onClick={stayIn} autoFocus data-testid="idle-stay">
            Stay signed in
          </button>
          <button onClick={() => void signOut()} data-testid="idle-leave">
            Sign out now
          </button>
        </div>
      </div>
    </div>
  );
}
