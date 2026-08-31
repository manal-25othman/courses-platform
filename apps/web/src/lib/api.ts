/**
 * Talks to the API.
 *
 * The website holds no rules of its own: it asks the API and shows what comes
 * back. Tokens travel in httpOnly cookies, which this file never reads —
 * `credentials: 'include'` lets the browser attach them (ARCHITECTURE 8.2).
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/**
 * Turns an API-relative path into one the browser can fetch.
 *
 * A picture's address is stored as this API's own route for it, so a page
 * needs the API's base to load it. Anything already absolute — a picture a
 * teacher linked to rather than uploaded — is left alone.
 */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return BASE.replace(/\/api\/v1$/, '') + path;
}

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
  examples?: string[];
  orderIndex: number;
  status: ContentStatus;
  type: SectionType;
  media: { id: string; url: string; altText: string | null }[];
  /** The address the teacher typed, as she typed it. */
  videoUrl?: string | null;
  needsReview?: boolean;
  reviewNotes?: string | null;
}

export interface VocabularyItem {
  id: string;
  wordEn: string;
  meaningAr: string | null;
  partOfSpeech: string | null;
  exampleSentence: string | null;
  orderIndex: number;
  status: ContentStatus;
  /** Pictures and the teacher's own recording of the word. */
  media?: MediaFile[];
  needsReview?: boolean;
  reviewNotes?: string | null;
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

export type QuestionPurpose = 'ACTIVITY' | 'ASSESSMENT';

export interface MediaFile {
  id: string;
  url: string;
  mimeType?: string;
  altText: string | null;
}

/** A question as the teacher sees it: answer key included. */
export interface Question {
  id: string;
  unitId: string;
  sectionId: string | null;
  typeKey: string;
  prompt: string;
  payload: Record<string, unknown>;
  answerKey: Record<string, unknown>;
  points: number;
  purpose: QuestionPurpose;
  orderIndex: number;
  needsReview: boolean;
  reviewNotes: string | null;
  sourceRef: string | null;
  status: ContentStatus;
  type?: QuestionType;
  media?: MediaFile[];
  section?: { id: string; title: string | null } | null;
}

export interface ReviewSummary {
  total: number;
  needingReview: number;
  published: number;
  readyToPublish: number;
  assessmentTotal: number;
  assessmentPublished: number;
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

/** One row of a matching question, as a teacher writes it. */
export interface Pair {
  id: string;
  left: string;
  right: string;
}

function itemList(value: unknown): { id: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((i): i is { id: string; text: string } =>
      Boolean(i) && typeof i === 'object' && 'id' in i && 'text' in i)
    .map((i) => ({ id: String(i.id), text: String(i.text) }));
}

/**
 * A matching question read back as pairs.
 *
 * Stored as two columns plus a map between them, because that is what the
 * engine shuffles and marks. A teacher thinks in pairs, so the form works in
 * pairs and this is the join between the two.
 */
export function pairsOf(question: Question): Pair[] {
  const left = itemList(question.payload?.left);
  const right = itemList(question.payload?.right);
  const map = (question.answerKey?.pairs ?? {}) as Record<string, string>;
  const rightById = new Map(right.map((r) => [r.id, r.text]));

  return left.map((l) => ({ id: l.id, left: l.text, right: rightById.get(map[l.id]) ?? '' }));
}

/** A word-ordering question read back as the sentence it makes. */
export function sentenceOf(question: Question): string {
  const tokens = itemList(question.payload?.tokens);
  const order = Array.isArray(question.answerKey?.order)
    ? (question.answerKey.order as string[])
    : tokens.map((t) => t.id);
  const byId = new Map(tokens.map((t) => [t.id, t.text]));

  return order.map((id) => byId.get(id) ?? '').join(' ').trim();
}

// --- Learning (student) ----------------------------------------------------

export interface ComponentProgress {
  total: number;
  done: number;
  percent: number;
  /** Nothing here yet, so this part cannot be finished. */
  empty: boolean;
}

/** How the unit's assessment stands for one student. */
export interface AssessmentState {
  questionCount: number;
  passMarkPercent: number;
  maxAttempts: number | null;
  attemptsUsed: number;
  attemptsLeft: number | null;
  bestScorePercent: number | null;
  passed: boolean;
  canStart: boolean;
  blockedBecause:
    | 'no_questions'
    | 'no_attempts_left'
    | 'already_passed'
    | 'vocabulary_incomplete'
    | 'grammar_incomplete'
    | null;
}

export interface UnitProgress {
  unitId: string;
  vocabulary: ComponentProgress;
  grammar: ComponentProgress;
  activity: ComponentProgress;
  assessment: ComponentProgress;
  /** Whether grammar is open to her yet, and if not, why not. */
  grammarLock: SectionLock;
  bestScorePercent: number | null;
  attemptsTaken: number;
  assessmentState: AssessmentState;
  /** False for Welcome and Grammar Review, which are not part of the course. */
  countsTowardCompletion: boolean;
  overallPercent: number;
  notCounted: string[];
  /** Parts the teacher has not added yet, which hold the unit below 100%. */
  missingContent: string[];
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
  examples: string[];
  orderIndex: number;
  type: SectionType & { progressComponent: string | null };
  media: { id: string; url: string; altText: string | null }[];
  /**
   * A player the API built from the stored address, or nothing.
   *
   * Never markup, and never the teacher's own text — only an address this
   * side puts in an iframe.
   */
  video: { embedUrl: string; provider: string } | null;
  viewed: boolean;
}

export interface LearnWord {
  id: string;
  wordEn: string;
  meaningAr: string | null;
  partOfSpeech: string | null;
  exampleSentence: string | null;
  orderIndex: number;
  /** A recording the teacher made, for a browser with no working voice. */
  teacherAudioUrl: string | null;
  /** A picture the teacher attached to this word. */
  pictureUrl: string | null;
  seen: boolean;
  audioPlayed: boolean;
  /** She has answered the check on this word correctly. */
  checked: boolean;
  learned: boolean;
  /** Read and heard, but not yet checked: the check is waiting for her. */
  checkReady: boolean;
  checkAttempts: number;
}

/** The check on one word, or the reason there cannot be one. */
export type VocabularyCheck =
  | {
      available: true;
      itemId: string;
      wordEn: string;
      options: { id: string; text: string }[];
    }
  | { available: false; itemId: string; wordEn: string; reason: string };

export interface CheckAnswerResult {
  correct: boolean;
  learned: boolean;
  attempts: number;
}

export interface LearnUnit {
  id: string;
  title: string;
  description: string | null;
  sections: LearnSection[];
  vocabulary: LearnWord[];
  activity: { questionCount: number };
  assessment: AssessmentState;
}

export interface AttemptQuestion {
  answerId: string;
  typeKey: string;
  prompt: string;
  payload: Record<string, unknown>;
  points: number;
  /** Pictures frozen with the question, part of what she was asked. */
  media?: MediaFile[];
  response: unknown;
  isCorrect?: boolean | null;
  pointsAwarded?: number | null;
  expected?: Record<string, unknown>;
}

export interface Attempt {
  id: string;
  unitId: string;
  purpose: QuestionPurpose;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  startedAt: string;
  submittedAt?: string | null;
  correctCount?: number | null;
  incorrectCount?: number | null;
  pointsAwarded?: number | null;
  pointsAvailable?: number | null;
  scorePercent?: number | null;
  /** The mark she had to reach, frozen with the score. Null for practice. */
  passMarkPercent?: number | null;
  passed?: boolean | null;
  questions: AttemptQuestion[];
}

/** One of her finished tries, as listed on the activity tab. */
export interface AttemptSummary {
  id: string;
  purpose?: QuestionPurpose;
  submittedAt: string | null;
  correctCount: number | null;
  incorrectCount: number | null;
  pointsAwarded: number | null;
  pointsAvailable: number | null;
  scorePercent: number | null;
  passMarkPercent?: number | null;
  passed?: boolean | null;
}

// --- Feedback between a teacher and a student ------------------------------

export interface Message {
  id: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  fromMe: boolean;
  senderName: string;
  senderRole: Role;
}

// --- The teacher's view of how her class is doing --------------------------

/** Whether a section is open to her yet, and if not, why not. */
export interface SectionLock {
  locked: boolean;
  reason: 'vocabulary_incomplete' | 'grammar_incomplete' | null;
}

export interface StudentUnitProgress extends UnitProgress {
  title: string;
}

export interface ClassRow {
  studentId: string;
  fullName: string;
  username: string;
  /** Averaged over the units that count towards the course, and no others. */
  overallPercent: number;
  unitsComplete: number;
  unitsCounted: number;
  lastActivityAt: string | null;
  unreadFromStudent: number;
  units: StudentUnitProgress[];
}

export interface ClassOverview {
  units: { id: string; title: string; countsTowardCompletion: boolean }[];
  students: ClassRow[];
}

export interface StudentWordProgress {
  id: string;
  wordEn: string;
  meaningAr: string | null;
  seen: boolean;
  audioPlayed: boolean;
  checked: boolean;
  learned: boolean;
  checkAttempts: number;
}

export interface StudentDetail {
  studentId: string;
  fullName: string;
  username: string;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  units: {
    unitId: string;
    title: string;
    progress: UnitProgress;
    attempts: AttemptSummary[];
    words: StudentWordProgress[];
  }[];
}

/** A teacher's own details, as she edits them. */
export interface TeacherProfile {
  displayName: string;
  title: string | null;
  whatsappPhone: string | null;
}

/** Her own teacher, and how to reach her. Null when she has none assigned. */
export interface MyTeacher {
  displayName: string;
  title: string | null;
  /** The address that opens WhatsApp, or null where no number is set. */
  whatsappUrl: string | null;
}

/** One finished paper as the teacher reads it, question by question. */
export interface TeacherAttemptDetail {
  id: string;
  purpose: QuestionPurpose;
  unit: { id: string; title: string };
  student: { id: string; fullName: string };
  submittedAt: string | null;
  correctCount: number | null;
  incorrectCount: number | null;
  pointsAwarded: number | null;
  pointsAvailable: number | null;
  scorePercent: number | null;
  passMarkPercent: number | null;
  passed: boolean | null;
  questions: (AttemptQuestion & { orderIndex: number })[];
}

/** How long ago something happened, in words a person would use. */
export function timeAgo(iso: string | null): string {
  if (!iso) return 'never';

  const then = new Date(iso).getTime();
  const minutes = Math.floor((Date.now() - then) / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;

  return new Date(iso).toLocaleDateString('en-GB');
}

/** A bonus review game, and whether this unit has enough content for it. */
export interface BonusGame {
  key: string;
  displayName: string;
  description: string | null;
  available: boolean;
  itemCount: number;
  minimumItems: number;
}

/** One round of a bonus game. Nothing about it is stored anywhere. */
export interface BonusGameRound {
  gameKey: string;
  unitId: string;
  pairs: { id: string; wordEn: string; meaningAr: string }[];
  questions: { wordEn: string; answer: string; options: string[] }[];
}
