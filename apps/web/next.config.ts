import type { NextConfig } from 'next';

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
};

export default nextConfig;
