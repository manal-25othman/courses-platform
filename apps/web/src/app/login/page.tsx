'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, FormEvent } from 'react';
import { api, ApiError, homeFor, Me } from '@/lib/api';
import { Brandmark } from '@/components/Shell';
import { PasswordField } from '@/components/PasswordField';
import { Girl } from '@/components/world/Girl';
import { Trailhead } from '@/components/world/Trailhead';
import { PLACES, themeVars } from '@/lib/world';

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
      <h1 className="signin-title">Your English journey starts here</h1>
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

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <main className="signin" style={themeVars(PLACES.meadow)}>
      {/* The field itself, behind everything, edge to edge. */}
      <Trailhead />

      <div className="signin-stage">
        <header className="signin-brand">
          <Brandmark />
        </header>

        <div className="signin-middle">
          {/* She stands at the head of the road, and the road goes to the
              panel -- so the eye travels her, then it, then the way in. */}
          <Girl who="lina" pose="wave" mood="bright" className="girl signin-girl" />

          {/* Words and form are one block. Split across the page they read as
              a caption for a picture rather than as an invitation to sign in. */}
          <div className="signin-entry">
            <Welcome />
            {children}
          </div>
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
