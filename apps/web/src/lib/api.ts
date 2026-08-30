/**
 * Talks to the API.
 *
 * The website holds no rules of its own: it asks the API and shows what comes
 * back. Tokens travel in httpOnly cookies, which this file never reads —
 * `credentials: 'include'` lets the browser attach them (ARCHITECTURE 8.2).
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Turns the API's error shape into one readable sentence. */
function readError(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(' ');
    if (typeof message === 'string') return message;
  }
  return `Something went wrong (${status}).`;
}

/**
 * One shared renewal attempt.
 *
 * Several requests can fail at the same moment when the short-lived access
 * token expires. Without this they would each try to renew, and because
 * renewing consumes the refresh token, the later ones would look like a stolen
 * token being replayed and end the session. Sharing one attempt avoids that.
 */
let renewal: Promise<boolean> | null = null;

async function renewSession(): Promise<boolean> {
  renewal ??= (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so requests failing together share this one.
      setTimeout(() => {
        renewal = null;
      }, 0);
    }
  })();

  return renewal;
}

/** Endpoints that must never trigger a renewal attempt. */
const NO_RENEW = ['/auth/login', '/auth/refresh', '/auth/logout'];

async function request<T>(path: string, init: RequestInit = {}, allowRenew = true): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

  // The access token is short-lived on purpose. When it expires, renew quietly
  // and repeat the request, so the user is not thrown out mid-task.
  if (response.status === 401 && allowRenew && !NO_RENEW.some((p) => path.startsWith(p))) {
    if (await renewSession()) {
      return request<T>(path, init, false);
    }
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);

  if (!response.ok) throw new ApiError(readError(body, response.status), response.status);

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';

export interface Me {
  id: string;
  username: string;
  role: Role;
  schoolId: string | null;
  displayName: string;
  mustChangePassword: boolean;
}

export interface Student {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  status: 'ACTIVE' | 'DISABLED';
  isDeleted: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Where a signed-in user belongs, by role. */
export function homeFor(user: Me): string {
  if (user.mustChangePassword) return '/change-password';
  return user.role === 'STUDENT' ? '/home' : '/students';
}
