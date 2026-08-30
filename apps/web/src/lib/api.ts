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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

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

export interface Me {
  id: string;
  username: string;
  role: 'ADMIN' | 'TEACHER' | 'STUDENT';
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
