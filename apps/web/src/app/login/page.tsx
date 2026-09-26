'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, FormEvent } from 'react';
import { api, ApiError, homeFor, Me } from '@/lib/api';
import { Brandmark } from '@/components/Shell';
import { PasswordField } from '@/components/PasswordField';
import { Icon } from '@/components/Icon';
import { Girl } from '@/components/world/Girl';
import { Trailhead } from '@/components/world/Trailhead';
import { PLACES, themeVars } from '@/lib/world';
import { TEACHER_ATTRIBUTION } from '@/lib/brand';

/**
 * The way in.
 *
 * Not a form on a decorative background: the page is the meadow. The same
 * meadow every unit stands in, laid out for a window instead of a card, with
 * the road from Grammar Adventure starting at Lina's feet and running away to
 * the right. Signing in is stepping onto it.
 *
 * Three things keep it from being wallpaper with a card on top. Lina is drawn
 * at the size of a character rather than a sticker, and she stands ON the
 * road, at its widest end. The panel is translucent and blurred, so the field
 * shows through it and it reads as something resting in the scene rather than
 * covering it. And the heading sits in the open air beside her, in the place's
 * own green, the way every unit banner in the product names its place.
 *
 * Nothing about signing in changed: same fields, same request, same errors,
 * same two notices, same link, same cookies.
 */

function Welcome() {
  return (
    <div className="signin-words">
      <p className="signin-eyebrow">Your English Journey</p>
      <h1 className="signin-title">Starts Here</h1>
      <p className="signin-sub">Learn, practise, and grow with TOP GOAL.</p>
    </div>
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

      // A refusal for trying too often is not a refusal of the password, and
      // showing it as one sends her to change something that was never wrong.
      // It says what happened and what to do, and names neither the account
      // nor whether it exists -- the limit applies the same either way.
      const tooMany = caught instanceof ApiError && caught.status === 429;

      setError(
        tooMany
          ? 'Too many sign-in attempts just now. Please wait a minute and try again — your username and password have not changed.'
          : looksLikeAnAddress
            ? 'That looks like an email address. Sign in with your username — your email is only used to send you a reset link.'
            : caught instanceof ApiError
              ? caught.message
              : 'Could not sign in.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="signin-panel">
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
        {/* The label is kept for anyone who cannot see the placeholder. */}
        <label htmlFor="username" className="sr-only">
          Username
        </label>
        <div className="pw-wrap pw-has-icon">
          <span className="pw-mark" aria-hidden="true">
            <Icon name="user" size={18} />
          </span>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            // Capitals do not matter to the server, and a tablet keyboard adds
            // one whether she wants it or not. Turning it off here means what
            // she sees matches what she meant.
            autoCapitalize="none"
            placeholder="Username"
            required
          />
        </div>

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
          testId="login-password"
          icon="lock"
          placeholder="Password"
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
          {!busy && <span className="signin-arrow" aria-hidden="true">→</span>}
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

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <main className="signin" style={themeVars(PLACES.meadow)}>
      {/* The field itself, behind everything, edge to edge. */}
      <Trailhead />

      <header className="signin-brand">
        <Brandmark />
        {/* Whose course this is. A name and a subject, under the mark --
            no contact details of any kind reach this page. */}
        <p className="signin-by">{TEACHER_ATTRIBUTION}</p>
      </header>

      <div className="signin-stage">
        {/* She stands beside the way in, at the near end of the path. */}
        <Girl who="lina" pose="wave" mood="bright" className="girl signin-girl" />

        <div className="signin-entry">
          <Welcome />
          {children}
        </div>
      </div>
    </main>
  );
}

function SignIn() {
  return (
    <Stage>
      <LoginForm />
    </Stage>
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
        <Stage>
          <div className="signin-panel signin-waiting" aria-hidden="true" />
        </Stage>
      }
    >
      <SignIn />
    </Suspense>
  );
}
