'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, FormEvent } from 'react';
import { api, ApiError, homeFor, Me } from '@/lib/api';
import { Brandmark } from '@/components/Shell';
import { PasswordField } from '@/components/PasswordField';
import { Icon } from '@/components/Icon';
import { Scene } from '@/components/world/Scene';
import { Girl } from '@/components/world/Girl';
import { PLACES, themeVars } from '@/lib/world';

/**
 * The way in.
 *
 * Every other screen a student sees stands in a place: a meadow with a dotted
 * path running through it, white posts along the way, Lina walking it. The
 * path is the one idea the whole product is built on — the trail of stations
 * on Home, the route through Grammar Adventure — so the front door is the
 * start of it. Lina waves at the trailhead; the path runs off toward the
 * horizon; signing in is stepping onto it.
 *
 * The panel is deliberately the same shape as the ticket on Home — a rounded
 * card with the scene along its floor and words above — because the point is
 * not that this page is pretty, it is that it is recognisably the same place.
 * A different shape here would be a different product.
 *
 * Nothing about signing in changed. The form below is the one that was here:
 * same fields, same request, same errors, same two notices, same link. Only
 * what surrounds it is new.
 */

/** What is actually inside, named in the student's own icons. */
const INSIDE = [
  { icon: 'words', label: 'Words' },
  { icon: 'grammar', label: 'Grammar' },
  { icon: 'games', label: 'Games' },
] as const;

function Welcome() {
  return (
    <section className="signin-welcome">
      <Brandmark />

      <div className="signin-words">
        <h1 className="signin-title">Your English Journey Starts Here</h1>
        <p className="signin-sub">Learn, practise, and grow with TOP GOAL.</p>
      </div>

      {/*
        The scene and Lina are the components the rest of the product draws
        with, not a picture made for this page. They cost nothing extra to
        ship — both are inline SVG already in the bundle — and they cannot
        drift away from the dashboard, because they are the dashboard's.
      */}
      {/*
        The scene draws itself from --w1/--w2/--w3, which a unit's theme
        supplies. Without them the hills paint black, which is exactly what
        the first render of this page did. `themeVars` is the supported way to
        hand a scene its colours, so the meadow here is the same green as the
        meadow on Home rather than a copy of its values.
      */}
      <div className="signin-scene" style={themeVars(PLACES.meadow)}>
        <Scene kind="meadow" fit="fill" className="scene" />
        <Girl who="lina" pose="wave" mood="bright" className="girl signin-girl" />
      </div>

      <ul className="signin-inside">
        {INSIDE.map((one) => (
          <li key={one.label}>
            <Icon name={one.icon} size={18} />
            {one.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Set after a password change, which signs every device out on purpose.
  const justChanged = params.get('changed') === '1';
  // Set when the inactivity guard signed somebody out. Arriving at a sign-in
  // screen with no explanation reads as a fault; this says what happened.
  const wentQuiet = params.get('reason') === 'inactive';
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
      // The API answers every failed sign-in with the same sentence, so that
      // nobody can discover which usernames are real — which also means it
      // cannot tell somebody they have typed the wrong *kind* of thing. An
      // address in this box matches nobody, and "incorrect username or
      // password" sends her to check a password that was never the problem.
      // Saying so reveals nothing: it is about what was typed here, not about
      // any account.
      const looksLikeAnAddress = username.includes('@');

      setError(
        looksLikeAnAddress
          ? 'That looks like an email address. Sign in with your username — your email is only used to send you a reset link.'
          : caught instanceof ApiError
            ? caught.message
            : 'Could not sign in.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="card raised signin-card">
      <h2 className="signin-heading">Sign in</h2>
      <p className="muted">Use the username you were given, not an email address.</p>

      {justChanged && (
        <p className="alert ok" style={{ marginTop: '1rem' }} role="status">
          Your password was changed. Please sign in with your new password.
        </p>
      )}

      {wentQuiet && (
        <p
          className="alert warn"
          style={{ marginTop: '1rem' }}
          role="status"
          data-testid="signed-out-idle"
        >
          You were signed out because you had been away for a while. Sign in to carry on.
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          // Capitals do not matter to the server, and a tablet keyboard adds
          // one whether she wants it or not. Turning it off here means what
          // she sees matches what she meant.
          autoCapitalize="none"
          required
        />

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
          testId="login-password"
        />

        {error && (
          <p className="alert error" style={{ marginTop: '1rem' }} role="alert">
            {error}
          </p>
        )}

        <button
          className="primary signin-go"
          type="submit"
          disabled={busy}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="muted signin-help">
        Forgotten your password?{' '}
        <a href="/forgot-password" data-testid="forgot-link">
          Send me a reset link
        </a>
        . If your account has no e-mail address, ask your teacher to reset it for you.
      </p>
    </div>
  );
}

function SignIn() {
  return (
    <main className="signin">
      <div className="signin-inner">
        <Welcome />
        <LoginForm />
      </div>
    </main>
  );
}

/**
 * Reading the query string forces this part to render in the browser, so it
 * sits behind a boundary and the rest of the page can still be prerendered.
 *
 * The fallback keeps the page's shape rather than showing a bare word, so
 * nothing jumps when the form arrives.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="signin">
          <div className="signin-inner">
            <Welcome />
            <div className="card raised signin-card signin-waiting" aria-hidden="true" />
          </div>
        </main>
      }
    >
      <SignIn />
    </Suspense>
  );
}
