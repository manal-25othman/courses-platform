import type { NextConfig } from 'next';

/** The API's own address. Not a secret — it is a public hostname. */
const apiOrigin = process.env.API_ORIGIN?.trim().replace(/\/+$/, '');

/**
 * Where the browser is allowed to fetch from, beyond this site itself.
 *
 * With the proxy below turned on there is nowhere else: NEXT_PUBLIC_API_URL is
 * the path `/api/v1`, every request is same-origin, and 'self' covers it. With
 * the proxy off the API is a different host, and leaving it out of the policy
 * would block every call the moment the deployment shape changes — a failure
 * that looks like a broken site rather than a tightened rule. So both shapes
 * are read from the environment and whichever is set is allowed.
 */
function apiOrigins(): string[] {
  const direct = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  const absolute = /^https?:\/\//i.test(direct) ? new URL(direct).origin : '';

  return [apiOrigin, absolute].filter((origin): origin is string => Boolean(origin));
}

/**
 * What the browser is told about every page this site serves.
 *
 * None of this changes a screen. It is a set of rules the browser applies to
 * the page it has just been given, and the one that earns its place here is
 * Strict-Transport-Security: a girl or a teacher who types the address without
 * `https` sends one unencrypted request before the redirect, and on a school's
 * own wireless that single request is enough to put a convincing fake sign-in
 * page in front of her. HSTS removes the request rather than redirecting it —
 * the browser refuses to send it at all, having been told once.
 *
 * `preload` is deliberately absent. It would hard-code the domain into the
 * browsers themselves, which takes months to undo and is a commitment this
 * domain is a week old to be making. The header works without it from the
 * first visit onward.
 *
 * The content policy is the careful one, because too strict a rule here breaks
 * a page silently. What the platform genuinely loads, and nothing more:
 *
 *   - Google Fonts, which globals.css imports (the stylesheet from
 *     fonts.googleapis.com, the font files from fonts.gstatic.com);
 *   - YouTube and Google Drive players, the only two embeds the API will build
 *     an address for (see apps/api/src/content/video.ts);
 *   - pictures and recordings over https, because a teacher may link to one
 *     rather than upload it, and `img-src 'self'` would blank those out.
 *
 * `script-src` keeps 'unsafe-inline'. Next.js hands hydration data to the page
 * in an inline script, and the alternative — a nonce — needs middleware on
 * every request and gives up static rendering, which on a free instance that
 * already takes a minute to wake is a real cost for a small gain. The policy
 * still fixes which *origins* may serve script, which is what stops an
 * injected `<script src>` from reaching anywhere.
 */
function securityHeaders(): { key: string; value: string }[] {
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    `connect-src ${["'self'", ...apiOrigins()].join(' ')}`,
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com https://drive.google.com',
  ].join('; ');

  return [
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // frame-ancestors above says the same thing to a browser that reads the
    // content policy. This is for the ones that do not.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // The platform asks for none of these, so a page that starts asking is a
    // page that has been tampered with.
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Content-Security-Policy', value: policy },
  ];
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev-tools badge sits over the bottom-left of the page, which is where
  // the student's navigation bar is. Hidden so local QA sees the real screen.
  devIndicators: false,
  // The web app talks to the API over HTTP like any other client, including the
  // future mobile app. It holds no business logic of its own (SRS 43).
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  },
  // Puts the API behind the website's own address, when the two are hosted
  // apart and have no domain in common.
  //
  // The API's tokens are SameSite=Lax cookies, and a browser will not keep one
  // that arrives from a different site — which a Vercel address and a Render
  // address are, being different registrable domains and not merely different
  // hosts. Signing in would answer 200, store nothing, and leave every screen
  // behaving as though nobody had signed in; nothing in the response says so.
  // CORS does not reach this, because SameSite is a separate rule.
  //
  // So the browser is given one origin to talk to. It asks the website, the
  // website asks the API, and the cookie comes back from the address the
  // browser is already on. The cookie stays Lax, which is the point: the
  // weaker alternative is to send SameSite=None, and that gives up the
  // cross-site protection Lax exists for.
  //
  // Set API_ORIGIN and this turns on; leave it unset and it does not exist.
  // When the two hosts later share a domain — app.example and api.example —
  // there is nothing to undo: drop API_ORIGIN, point NEXT_PUBLIC_API_URL at
  // the API's own address, and the browser talks to it directly again.
  async rewrites() {
    if (!apiOrigin) return [];

    return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }];
  },
};

export default nextConfig;
