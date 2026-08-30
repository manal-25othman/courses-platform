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

export type ContentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface SectionType {
  key: string;
  displayName: string;
  description: string | null;
  isVocabulary: boolean;
  isPaperBased: boolean;
  orderIndex: number;
}

export interface UnitSummary {
  id: string;
  title: string;
  kind: string | null;
  description: string | null;
  orderIndex: number;
  status: ContentStatus;
  _count: { sections: number; vocabularyItems: number };
}

export interface Section {
  id: string;
  typeKey: string;
  title: string | null;
  body: string | null;
  orderIndex: number;
  status: ContentStatus;
  type: SectionType;
  media: { id: string; url: string; altText: string | null }[];
}

export interface VocabularyItem {
  id: string;
  wordEn: string;
  meaningAr: string | null;
  partOfSpeech: string | null;
  exampleSentence: string | null;
  orderIndex: number;
  status: ContentStatus;
}

export interface UnitDetail extends Omit<UnitSummary, '_count'> {
  sections: Section[];
  vocabularyItems: VocabularyItem[];
}

/** Where a signed-in user belongs, by role. */
export function homeFor(user: Me): string {
  if (user.mustChangePassword) return '/change-password';
  return user.role === 'STUDENT' ? '/home' : '/students';
}

// --- Questions (Phase 4 engine, edited here in Phase 5) --------------------

export interface QuestionType {
  key: string;
  displayName: string;
  description: string | null;
  supportsOptionShuffle: boolean;
  isTyped: boolean;
  needsMedia: boolean;
  presentInSource: boolean;
  isActive: boolean;
  orderIndex: number;
}

/** A question as the teacher sees it: answer key included. */
export interface Question {
  id: string;
  unitId: string;
  typeKey: string;
  prompt: string;
  payload: Record<string, unknown>;
  answerKey: Record<string, unknown>;
  points: number;
  orderIndex: number;
  needsReview: boolean;
  reviewNotes: string | null;
  sourceRef: string | null;
  status: ContentStatus;
  type?: QuestionType;
}

export interface ReviewSummary {
  total: number;
  needingReview: number;
  published: number;
  readyToPublish: number;
}

export interface Choice {
  id: string;
  text: string;
}

/** The options a choice-style question offers, if it has any. */
export function choicesOf(question: Question): Choice[] {
  const options = question.payload?.options;
  if (!Array.isArray(options)) return [];
  return options
    .filter((o): o is Choice => Boolean(o) && typeof o === 'object' && 'id' in o && 'text' in o)
    .map((o) => ({ id: String(o.id), text: String(o.text) }));
}

/** Which choice is marked correct, or null where the kind works differently. */
export function correctChoiceId(question: Question): string | null {
  const key = question.answerKey?.correctOptionId;
  return typeof key === 'string' ? key : null;
}

// --- Learning (student) ----------------------------------------------------

export interface ComponentProgress {
  total: number;
  done: number;
  percent: number;
}

export interface UnitProgress {
  unitId: string;
  vocabulary: ComponentProgress;
  grammar: ComponentProgress;
  activity: ComponentProgress;
  bestScorePercent: number | null;
  attemptsTaken: number;
  overallPercent: number;
  notCounted: string[];
  isComplete: boolean;
}

export interface LearnUnitSummary {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  progress: UnitProgress;
}

export interface LearnSection {
  id: string;
  typeKey: string;
  title: string | null;
  body: string | null;
  orderIndex: number;
  type: SectionType & { progressComponent: string | null };
  media: { id: string; url: string; altText: string | null }[];
  viewed: boolean;
}

export interface LearnWord {
  id: string;
  wordEn: string;
  meaningAr: string | null;
  partOfSpeech: string | null;
  exampleSentence: string | null;
  orderIndex: number;
  seen: boolean;
  audioPlayed: boolean;
  learned: boolean;
}

export interface LearnUnit {
  id: string;
  title: string;
  description: string | null;
  sections: LearnSection[];
  vocabulary: LearnWord[];
  activity: { questionCount: number };
}

export interface AttemptQuestion {
  answerId: string;
  typeKey: string;
  prompt: string;
  payload: Record<string, unknown>;
  points: number;
  response: unknown;
  isCorrect?: boolean | null;
  pointsAwarded?: number | null;
  expected?: Record<string, unknown>;
}

export interface Attempt {
  id: string;
  unitId: string;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  startedAt: string;
  submittedAt?: string | null;
  correctCount?: number | null;
  incorrectCount?: number | null;
  pointsAwarded?: number | null;
  pointsAvailable?: number | null;
  scorePercent?: number | null;
  questions: AttemptQuestion[];
}

/** One of her finished tries, as listed on the activity tab. */
export interface AttemptSummary {
  id: string;
  submittedAt: string | null;
  correctCount: number | null;
  incorrectCount: number | null;
  pointsAwarded: number | null;
  pointsAvailable: number | null;
  scorePercent: number | null;
}
