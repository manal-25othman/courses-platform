/**
 * Types shared between the API and its clients.
 *
 * The web app and, later, the mobile app both import from here, so a change to
 * the API contract shows up as a compile error rather than a runtime surprise
 * (ARCHITECTURE 28).
 *
 * Phase 0 defines only the health endpoint. Domain types arrive with the
 * features that use them.
 */

/** Response of GET /api/v1/health */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  database: 'connected' | 'unreachable';
  timestamp: string;
}
