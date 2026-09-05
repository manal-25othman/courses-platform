import type { NextConfig } from 'next';

/** The API's own address. Not a secret — it is a public hostname. */
const apiOrigin = process.env.API_ORIGIN?.trim().replace(/\/+$/, '');

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
};

export default nextConfig;
