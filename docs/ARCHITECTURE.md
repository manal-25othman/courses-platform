# 🏗️ System Architecture & Technical Design
# Interactive English Learning Platform — TOP GOAL

**Status:** Planning / Architecture Phase — awaiting client approval
**Source of Truth:** `docs/SRS.md` (SRS v1.1, sections 1–60)
**Deliverable type:** Design document only. No implementation code, no UI, no database created.

---

## 0. How to read this document

Every statement in this document is labelled by its authority level, following SRS §57 and §59:

| Label | Meaning |
|---|---|
| **[C]** Confirmed | Comes directly from the SRS. Not negotiable without an SRS change. |
| **[P]** Provisional | An implementation approach. Must stay configurable (SRS §55). |
| **[T]** TBD | Open item. **Not decided here.** Must be answered by the client (SRS §56). |
| **[D]** Decision Needed | A technical decision I am proposing but that requires your explicit approval before it becomes binding (SRS §59.4). |

**Nothing in this document invents a requirement.** Where the SRS is silent, the item is marked **[T]** or **[D]**, never silently resolved.

### 0.1 ملخص تنفيذي (Arabic summary)

هذه وثيقة تصميم معماري فقط — لا يوجد كود ولا واجهات ولا قاعدة بيانات.
المبدأ الأساسي في التصميم: **كل شيء غير محسوم يُخزَّن كإعداد (Configuration) في قاعدة البيانات، وليس داخل الكود.**

بالتحديد، العناصر التالية **لن تكون Hard-Coded** إطلاقًا:
عدد الوحدات، عدد الأسئلة، أنواع الأسئلة، نسبة النجاح (80%)، عدد المحاولات (2)، أوزان التقدم، أنواع الألعاب، اسم المعلمة، عدد المدارس، نص رسالة الواتساب.

كل هذه القيم تُقرأ من جدول إعدادات، ويمكن تعديلها لاحقًا دون إعادة بناء النظام.
البنود المؤجلة (TBD) موضحة في القسم 36، والأسئلة التي أحتاج قرارك فيها في القسم 37.

---

## 1. Purpose & Architectural Principles

The architecture is driven by three hard constraints from the SRS:

1. **Nothing curriculum-shaped may be hard-coded** (§9, §44, §45, §58).
   Four units, N questions, 9 question types, 80% pass mark, 2 attempts, game types — all of these are *current data values*, not code structure.
2. **Security must be enforced server-side, at API and database level** (§37, §38).
   Hiding data in the UI is explicitly declared insufficient.
3. **The backend and API must be reusable by a future mobile app** (§43).
   This rules out designs where business logic lives in the web UI.

### 1.1 The single most important design decision

Every value the SRS marks as Confirmed-but-changeable (§17 passing score, §18 attempts), Provisional (§55) or TBD (§56) is stored in a **Settings/Configuration store**, resolved at runtime through a scope hierarchy:

```text
Assessment/Activity level  →  Unit level  →  Course level  →  School level  →  Global default
        (most specific wins, first match returned)
```

This is what makes "80%", "2 attempts", "progress weights", "does a game count toward completion", and "the WhatsApp message text" changeable **without a code change or a redeploy** — satisfying §17, §19, §21, §55, §56 and §58 with one mechanism instead of nine special cases.

### 1.2 Principles applied throughout

| Principle | How it is realised |
|---|---|
| Data-driven | Content, questions, question *types*, and rules live in the database |
| Modular | One module per SRS architectural concern (§52) |
| Secure by default | Deny-first authorization; every query scoped by actor |
| Extensible | New question types / games / notification types = new rows + one handler, no rebuild |
| API-first | Web UI is one client of the API; mobile is a second client later |
| Auditable | Destructive teacher actions are logged |

---

## 2. Technology Stack — **[C] CONFIRMED (client-approved)**

The SRS does not name any technology, so this was a technical decision requiring client approval under §59.4. **Approved by the client: Option A — Next.js + NestJS + PostgreSQL, separate web and API deployments, token-based authentication, API designed for future mobile reuse (§43).**

Client context recorded with the decision: the client is a beginner and asked for the simplest maintainable approach. Option A carries more operational overhead than Option B, so the following simplifications are part of the approved decision: a single monorepo (not two repositories), managed hosting for both apps (no server administration), Prisma-managed migrations, and a shared types package to prevent web/API drift.

### 2.1 Primary recommendation

| Layer | Recommendation | Why (traced to SRS) |
|---|---|---|
| Language | **TypeScript** (backend + frontend) | One language, shared types between API and clients; reduces defects in a small team |
| Backend | **NestJS** (Node.js) | Its module system maps 1:1 onto the 12 architectures required by §52; built-in guards/interceptors are the natural place for §37 server-side permission checks |
| API style | **REST + JSON, versioned (`/api/v1`)** | Simplest contract for a future native mobile client (§43); easy to cache and debug |
| Database | **PostgreSQL** | Needs both strict relational integrity (progress, attempts) *and* flexible per-type structures (question payloads via JSONB) — §10, §46. Also provides Row-Level Security for §37 "database-level protection" |
| ORM / access | **Prisma** | Type-safe queries, first-class migrations, readable schema for a maintainable handover (§58) |
| Frontend | **Next.js (React) + TypeScript** | Mature responsive ecosystem (§42), good performance on low-end mobile devices |
| Styling | **Tailwind CSS + a component library** | Fast, consistent, responsive; theming stays token-based so final branding (§41 TBD) can be swapped without rewriting UI |
| Auth | **JWT access token + rotating refresh token** | Same mechanism works for web *and* native mobile (§43); avoids cookie-only designs that mobile cannot reuse |
| Validation | **Zod / class-validator** schemas | §37 input validation, applied at the API boundary |
| Password hashing | **Argon2id** (bcrypt acceptable fallback) | §37 password hashing, current best practice |
| Testing | **Vitest/Jest + Supertest + Playwright** | See §32 |

### 2.2 The one structural choice you should consciously make

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A — Separate API (recommended)** | NestJS API deployed separately; Next.js consumes it | Mobile app (§43) consumes the *identical* API with zero refactor; clean security boundary; easiest to reason about tenant isolation | Two deployables, slightly more DevOps |
| **B — Next.js fullstack** | API routes inside Next.js | One deployable, faster initial setup, lower hosting cost | Mobile readiness becomes a later refactor risk; business logic tends to leak into UI code |

**CONFIRMED: Option A**, approved by the client. §43 is an explicit requirement, and Option B tends to satisfy it only on paper.

**Reversibility note:** Option B → A later is a real refactor (weeks). Option A → B is trivial. This is why I recommend A: it is the *less* irreversible choice. This decision needs your sign-off before Phase 0.

### 2.3 What I deliberately did NOT choose

- **Push provider** — §56 lists this as TBD. Architecture uses an adapter (see §22).
- **TTS/audio provider** — §55 lists this as Provisional. Architecture uses an adapter (see §16).
- **Hosting/deployment target** — see §33, marked **[D]**.
- **Branding, colors, typography** — §41 TBD. UI will use neutral design tokens until approved.

---

## 3. System Architecture

### 3.1 High-level view

```text
┌───────────────────────────────────────────────────────────────┐
│  CLIENTS                                                      │
│                                                               │
│  Responsive Web App (MVP)          Mobile App (future, §43)   │
│  Student UI │ Teacher UI │ Admin UI      (same API contract)  │
└───────────────────────┬───────────────────────────────────────┘
                        │  HTTPS / REST / JSON + Bearer token
┌───────────────────────▼───────────────────────────────────────┐
│  API LAYER                                                    │
│  Routing → Rate limiting → Authentication → Authorization     │
│          → Input validation → Tenant scope injection          │
└───────────────────────┬───────────────────────────────────────┘
┌───────────────────────▼───────────────────────────────────────┐
│  DOMAIN MODULES  (one per SRS §52 requirement)                │
│                                                               │
│  Identity  │ Tenancy  │ Content  │ QuestionEngine             │
│  Assessment│ Progress │ Gamify   │ Messaging                  │
│  Notify    │ Games    │ Settings │ Audit                      │
└───────────────────────┬───────────────────────────────────────┘
┌───────────────────────▼───────────────────────────────────────┐
│  DATA ACCESS LAYER  — tenant scope enforced here, always      │
└───────────────────────┬───────────────────────────────────────┘
┌───────────────────────▼───────────────────────────────────────┐
│  PostgreSQL  (+ Row-Level Security as defense in depth)       │
└───────────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   TTS/Audio       Push Provider    (WhatsApp = client-side
   Adapter [P]     Adapter [T]       deep link, no backend)
```

### 3.2 Deployment shape **[P]**

A **modular monolith**, not microservices. Rationale: the SRS describes one school, one teacher, and a Grade 6 cohort. Microservices would add operational cost with no benefit and would make tenant isolation *harder* to guarantee. The module boundaries above are strict enough that any module could later be extracted if genuine scale demanded it (§44).

### 3.3 Module responsibilities

| Module | Owns | SRS |
|---|---|---|
| Identity | Users, credentials, sessions, password reset | §27, §28, §37 |
| Tenancy | Schools, teacher–student assignment, scope resolution | §34, §35, §38 |
| Content | Courses, units, vocabulary, grammar, activities, publishing | §29, §30, §32, §45 |
| QuestionEngine | Question types registry, payload validation, presentation, grading | §10, §11, §12 |
| Assessment | Attempts, scoring, pass/fail, retake limits, result policy | §15–§19, §46, §47 |
| Progress | Component/unit/overall progress, completion gate, auto-save | §16, §20–§23 |
| Gamification | Points/stars ledger | §14 |
| Games | Game definitions, sessions | §13 |
| Messaging | Threads, messages, feedback linkage | §24 |
| Notify | Notification records, channel dispatch, subscriptions | §25, §50 |
| Settings | Configuration resolution across scopes | §17, §19, §21, §55, §56 |
| Audit | Action log for sensitive operations | §37 |

---

## 4. Database Architecture

### 4.1 Strategy **[P]**

**Single database, shared schema, tenant discriminator column (`school_id`).**

Alternatives considered:

| Model | Verdict |
|---|---|
| Database-per-school | Rejected for MVP — heavy operations, painful migrations, unjustified for one school (§34 says *ready for* multiple, not *many now*) |
| Schema-per-school | Rejected — same objection, less tooling support |
| **Shared schema + `school_id` + RLS** | **Chosen** — simple, scales to realistic school counts, and RLS gives the database-level protection §37 explicitly demands |

If a future client demands physical separation, the `school_id` design migrates to database-per-tenant without a data-model rewrite.

### 4.2 Rules enforced on every tenant-scoped table

1. Every tenant-scoped table carries `school_id`, **not nullable**.
2. No application query may omit tenant scope — it is injected by the data access layer, not written by hand per query.
3. PostgreSQL **Row-Level Security** policies act as a second, independent barrier (§37 "Database-Level Data Protection").
4. Foreign keys never cross tenants. Composite/validated FKs prevent linking a student in School A to a unit progress row in School B.
5. Student-owned rows carry `student_id`; students are additionally restricted to `student_id = self` (§5, §37 example).

### 4.3 Data lifecycle notes

- **Deletion (§27 "Delete Student"):** soft delete by default — hard deletion would orphan attempts, messages and progress history. Hard delete offered as an explicit, audited action. **[P]**
- **Content edits vs. history (§30):** attempts store a *snapshot* of the question as answered. Editing a question later must never retroactively change a past result. This is a correctness requirement I am flagging because the SRS allows content editing (§30) and requires stored results (§46) simultaneously.
- **Timestamps:** all tables carry `created_at` / `updated_at`; UTC storage.

---

## 5. Data Model

Notation: `PK` primary key, `FK` foreign key, `JSONB` flexible structured column. This is a *design proposal* — no database is created at this stage.

### 5.1 Tenancy & Identity

**`schools`** — §34
| Field | Notes |
|---|---|
| id `PK` | |
| name | |
| status | active / disabled |
| created_at | |

**`users`** — authentication identity for all three roles (§3, §4, §5)
| Field | Notes |
|---|---|
| id `PK` | |
| school_id `FK` | nullable **only** for platform admin (§3.1) |
| role | `admin` \| `teacher` \| `student` — extensible |
| username | unique per school (§27 uses username, not email) |
| email | nullable — see §36 open item on recovery channel |
| password_hash | Argon2id (§37) |
| status | active / disabled (§4 "تعطيل حساب الطالبة") |
| last_login_at, created_at, deleted_at | soft delete |

**`teacher_profiles`** — §33 Teacher Attribution
| Field | Notes |
|---|---|
| user_id `PK/FK` | |
| display_name | **the attribution source — never hard-coded in UI (§33)** |
| whatsapp_phone | drives the §26 deep link |
| title / bio | optional |

**`student_profiles`** — §27
| Field | Notes |
|---|---|
| user_id `PK/FK` | |
| full_name | |
| assigned_teacher_id `FK` | supports the §35 Teacher → Students hierarchy |

**`refresh_tokens`** — §37 secure sessions
| Field | Notes |
|---|---|
| id `PK`, user_id `FK` | |
| token_hash | never stored in plaintext |
| expires_at, revoked_at, device_label | rotation + remote logout |

**`password_reset_tokens`** — §28
| Field | Notes |
|---|---|
| id `PK`, user_id `FK` | |
| token_hash, expires_at, used_at | single-use, short-lived |
| issued_by | `self` (recovery) or teacher user id (§28 Teacher Reset) |

**`audit_log`** — §37
| Field | Notes |
|---|---|
| id `PK`, school_id, actor_user_id | |
| action | e.g. student.delete, student.password_reset |
| target_type, target_id, metadata `JSONB`, created_at | |

### 5.2 Content (§29–§32, §45)

**`courses`** — container for the curriculum (currently: TOP GOAL, Grade 6)
| Field | Notes |
|---|---|
| id `PK`, title, description | |
| owner_school_id `FK` | **nullable** — null = shared library. See §37 open decision |
| status | draft / published |

**`units`** — §6. **Count is data, not code.**
| Field | Notes |
|---|---|
| id `PK`, course_id `FK` | |
| order_index | ordering, not identity — no "Unit 1..4" constants anywhere |
| title, description, status | |

**`vocabulary_items`** — §7
| Field | Notes |
|---|---|
| id `PK`, unit_id `FK`, order_index | |
| word_en, meaning_ar, part_of_speech, example_sentence | all optional per §7 "يمكن أن يحتوي" |
| audio_url | nullable — filled only if pre-generated audio is used (§16) |

**`grammar_lessons`** — §8
| Field | Notes |
|---|---|
| id `PK`, unit_id `FK`, order_index | |
| title, explanation | rich text |
| status | |

**`grammar_examples`**
| Field | Notes |
|---|---|
| id `PK`, grammar_lesson_id `FK`, order_index, text, note | |

**`activities`** — §9 (one per unit today; the model does not enforce that)
| Field | Notes |
|---|---|
| id `PK`, unit_id `FK`, order_index, title | |
| question_set_id `FK` | |
| config `JSONB` | retry behaviour etc. (§55 Provisional) |
| status | |

**`assessments`** — §15
| Field | Notes |
|---|---|
| id `PK`, unit_id `FK`, title | |
| question_set_id `FK` | |
| config `JSONB` | may override passing score / attempts / shuffling |
| status | |

### 5.3 Question Engine (§10–§12, §46)

**`question_types`** — the extensibility registry. Adding a type is a **row**, not a rebuild.
| Field | Notes |
|---|---|
| type_key `PK` | e.g. multiple_choice, matching, true_false, word_ordering, missing_letter, picture_matching, spelling, short_answer, grammar_transformation (§10) |
| display_name, description | |
| payload_schema `JSONB` | validates question authoring input |
| supports_option_shuffle | drives §11 option randomization |
| is_active, schema_version | |

**`questions`**
| Field | Notes |
|---|---|
| id `PK`, unit_id `FK`, type_key `FK` | |
| prompt | |
| payload `JSONB` | type-specific structure (options, pairs, tokens, image refs…) |
| answer_key `JSONB` | **never leaves the server** (§37) |
| points | default 1, configurable |
| tags, status, created_by, version, updated_at | |

**`question_sets`** — §9 variable count, §46
| Field | Notes |
|---|---|
| id `PK` | |
| selection_mode | `all` \| `random_n` |
| question_count | nullable; used with random_n — **no fixed count in code** |
| shuffle_questions, shuffle_options | booleans (§11) |

**`question_set_items`**
| Field | Notes |
|---|---|
| id `PK`, question_set_id `FK`, question_id `FK`, order_index, is_required | |

### 5.4 Attempts, Responses, Auto-Save (§18, §23, §46, §47)

**`attempts`**
| Field | Notes |
|---|---|
| id `PK`, school_id, student_id `FK` | |
| target_type | `assessment` \| `activity` \| `game` |
| target_id | |
| attempt_number | enforced against max attempts (§18) |
| seed | **stored** so shuffled order is reproducible on resume (§11 + §23) |
| status | in_progress / submitted / expired |
| started_at, submitted_at, last_saved_at | |
| score_raw, score_max, score_percent | §47 |
| is_passed, passing_score_applied | the threshold *in force at that moment* is recorded |
| policy_snapshot `JSONB` | records which rules graded this attempt |

**`attempt_items`**
| Field | Notes |
|---|---|
| id `PK`, attempt_id `FK`, question_id `FK`, order_index | |
| question_snapshot `JSONB` | protects history from later content edits (§4.3) |
| presented_payload `JSONB` | the shuffled option order actually shown |
| response `JSONB` | written incrementally = auto-save (§23) |
| is_correct, points_awarded, answered_at | |

### 5.5 Progress (§20–§22)

**`vocabulary_progress`** — §22 requires per-item completion state
| Field | Notes |
|---|---|
| id `PK`, school_id, student_id, vocabulary_item_id `FK` | |
| viewed_at, audio_played_at, is_completed, updated_at | |

**`component_progress`**
| Field | Notes |
|---|---|
| id `PK`, school_id, student_id, unit_id `FK` | |
| component_type | vocabulary / grammar / activity / game / assessment (§20) |
| status, percent, completed_at, updated_at | |

**`unit_progress`**
| Field | Notes |
|---|---|
| id `PK`, school_id, student_id, unit_id `FK` | |
| status, percent | percent uses configurable weights (§21 TBD) |
| is_completed, completed_at | gated by §16 rules |
| best_score_percent, official_score_percent | separated because §19 is TBD |

### 5.6 Gamification (§14)

**`points_ledger`** — append-only, so the rules can change without rewriting history
| Field | Notes |
|---|---|
| id `PK`, school_id, student_id, source_type, source_id | |
| points, reason, created_at | |

Stars: **[T]** derived from configurable thresholds; formula not decided (§14, §56).

### 5.7 Messaging & Feedback (§24)

**`threads`**
| Field | Notes |
|---|---|
| id `PK`, school_id, teacher_user_id, student_user_id | |
| last_message_at, status | |

**`messages`**
| Field | Notes |
|---|---|
| id `PK`, thread_id `FK`, school_id, sender_user_id | |
| kind | `message` \| `feedback` \| `note` (§24) |
| body | |
| context_type, context_id | nullable link to Unit / Activity / Assessment (§24) |
| created_at, read_at | |

### 5.8 Notifications (§25, §50)

**`notification_types`** — extensible by row (§50)
| Field | Notes |
|---|---|
| type_key `PK`, display_name, default_channels, is_active | |

**`notifications`**
| Field | Notes |
|---|---|
| id `PK`, school_id, recipient_user_id, type_key `FK` | |
| title, body, data `JSONB`, read_at, created_at | |

**`push_subscriptions`**
| Field | Notes |
|---|---|
| id `PK`, user_id `FK`, platform (web/ios/android) | mobile-ready (§43) |
| endpoint_or_token, keys `JSONB`, device_label | |
| created_at, last_seen_at, revoked_at | |

**`notification_deliveries`**
| Field | Notes |
|---|---|
| id `PK`, notification_id `FK`, channel, status, provider_message_id, error, attempted_at | |

### 5.9 Settings — the anti-hard-coding backbone (§17, §19, §21, §55, §56, §58)

**`settings`**
| Field | Notes |
|---|---|
| id `PK` | |
| scope | global / school / course / unit / assessment |
| scope_id | nullable for global |
| key | e.g. `assessment.passing_score`, `assessment.max_attempts`, `assessment.result_policy`, `progress.weights`, `randomization.*`, `games.affect_progress`, `whatsapp.message_template`, `gamification.*` |
| value `JSONB` | |
| updated_by, updated_at | |

Seeded values at install: `passing_score = 80` (§17 Confirmed), `max_attempts = 2` (§18 Confirmed). **Stored as data, changeable without deployment — exactly as §17 requires.**

---

## 6. Entity Relationships

```text
School ──1:N── User ──1:1── TeacherProfile
   │                └─1:1── StudentProfile ──N:1── assigned Teacher
   │
   └─── (all tenant-scoped rows carry school_id)

Course ──1:N── Unit ──┬──1:N── VocabularyItem
                      ├──1:N── GrammarLesson ──1:N── GrammarExample
                      ├──1:N── Activity   ──1:1── QuestionSet
                      ├──1:N── Game
                      └──1:1── Assessment ──1:1── QuestionSet

QuestionType ──1:N── Question ──N:M(QuestionSetItem)── QuestionSet

Student ──1:N── Attempt ──1:N── AttemptItem ──N:1── Question
Student ──1:N── VocabularyProgress / ComponentProgress / UnitProgress
Student ──1:N── PointsLedger
Teacher ──1:N── Thread ──1:N── Message ──(optional context)── Unit/Activity/Assessment
User    ──1:N── Notification / PushSubscription
```

**Relationship notes:**

- `Unit → Assessment` is modelled **1:1 today** (§15) but through a normal FK, so a second assessment per unit is an insert, not a migration.
- `Question ↔ QuestionSet` is many-to-many so one question can be reused across an activity and an assessment without duplication.
- `Attempt → AttemptItem` carries the snapshot, decoupling stored results from live content.
- `Student → Teacher` is a direct FK because §35 shows Teacher → Students. **No "class" or "section" entity exists — the SRS does not mention one, so I did not invent it.**

---

## 7. User Roles & Permissions

Roles are **data** (`users.role` + a permission map), so a future role (e.g. School Admin, Parent) does not require restructuring (§44).

| Capability | Student | Teacher | Admin |
|---|:--:|:--:|:--:|
| Log in / recover own password (§28) | ✔ | ✔ | ✔ |
| View units, vocabulary, grammar, activities, games (§5) | ✔ | ✔ | ✔ |
| Play audio pronunciation (§7) | ✔ | ✔ | ✔ |
| Take assessment / view **own** results (§5) | ✔ | — | — |
| View **another student's** data (§5, §37) | ✘ **hard denied** | own students only | ✔ (scoped) |
| Edit content or questions (§5) | ✘ | ✔ (§4) | ✔ |
| Edit own results (§5) | ✘ **hard denied** | ✘ | ✘ |
| Create / edit / disable / delete student (§27) | ✘ | ✔ | ✔ |
| Reset a student's password (§28) | ✘ | ✔ | ✔ |
| Send feedback (§24) | reply only | ✔ | — |
| Send message to teacher (§24) | ✔ | ✔ | — |
| Receive push notifications (§25) | ✔ | ✔ | — |
| Access teacher dashboard (§5) | ✘ **hard denied** | ✔ | ✔ |
| Manage schools / teachers (§3.1) | ✘ | ✘ | ✔ |

The four **hard denied** rows are the §37 "Critical Requirement" cases. They are tested explicitly (see §32) by issuing direct API requests as a student, not merely by hiding UI.

---

## 8. Authentication (§28, §37, §43)

### 8.1 Credentials

- Students and teachers authenticate with **username + password** (§27 lists Username/Password, not email).
- Passwords hashed with **Argon2id**; plaintext is never stored, logged, or returned. **[C §37]**
- Password strength policy: **[P]** configurable via Settings — Grade 6 students need usable passwords, so an adult-grade policy may be counterproductive. Value not fixed here.

### 8.2 Token model **[P]**

```text
Login  →  Access token  (short-lived, e.g. 15 min, stateless)
       →  Refresh token (long-lived, rotating, hashed in DB, revocable)
```

- **Web:** tokens delivered in `httpOnly` `Secure` `SameSite` cookies (protects against XSS token theft).
- **Mobile (future §43):** same endpoints return tokens in the response body for secure device storage.
- Rotation on every refresh; reuse of a consumed refresh token revokes the whole family (theft detection).
- Logout revokes the refresh token server-side — not just a client-side token discard.

This design is the reason a mobile app needs **zero** authentication rework later.

### 8.3 Password recovery (§28) — **contains an open item**

| Flow | Status |
|---|---|
| Teacher resets a student's password from the dashboard | **[C]** Fully specified in §28. Generates a single-use token or a temporary password; forces change at next login **[P]**; written to `audit_log`. |
| Teacher recovers her own password | **[C]** required by §28. Standard email-based reset — **but no teacher email field is specified in the SRS** → see §36. |
| **Student self-service recovery** | **[T] BLOCKED — see §36.1.** §28 grants students self-recovery, but §27 defines a student account as Name + Username + Password only, with **no email or phone**. There is no channel to deliver a reset. This needs your decision. |

I have **not** invented a recovery channel for students. The architecture supports several (see §36.1) and the decision is yours.

### 8.4 Anti-abuse **[P]**

Rate limiting and progressive lockout on login and password-reset endpoints; generic error messages that do not reveal whether a username exists.

---

## 9. Authorization (§37)

### 9.1 Three enforcement layers — all server-side

```text
Layer 1  Role check          — is this role allowed to call this endpoint at all?
Layer 2  Tenant scope        — school_id injected into every query, automatically
Layer 3  Ownership/policy    — is THIS actor allowed THIS specific row?
```

A request must pass **all three**. UI-level hiding is presentation only and is never counted as protection (§37 explicit).

### 9.2 Deny-by-default

Every endpoint declares its required role and policy. An endpoint with no declaration is **rejected**, not allowed. This prevents the most common real-world failure: a newly added route that nobody remembered to protect.

### 9.3 Ownership policies

| Resource | Rule |
|---|---|
| Attempt / progress / result | `student_id == current_user` (student) or student ∈ teacher's students (teacher) |
| Thread / message | actor is a participant |
| Notification | `recipient_user_id == current_user` |
| Student record | teacher owns the student, same school |
| Content edit | teacher/admin role + content in scope |

### 9.4 IDOR prevention

Object IDs are never trusted. Every fetch is `WHERE id = ? AND school_id = ? AND <ownership>` — a student requesting another student's attempt ID receives **404**, not 403 (avoids confirming the record exists). This is the direct implementation of the §37 example.

**[P]** Recommendation: UUIDs rather than sequential integers for public identifiers, so IDs are not guessable/enumerable.

---

## 10. Multi-School Architecture (§34)

- `schools` is a first-class table from day one, even though the MVP has one school.
- Every tenant-scoped row carries `school_id` from day one. **Retrofitting a tenant column onto a live system is one of the most expensive migrations in this class of application — so it is present at the start even while unused.**
- Admin operates above the tenant boundary; teacher and student are always inside exactly one.
- Adding School B = inserting rows. No schema change, no code change (§44).

**Open item:** whether curriculum content is shared across schools or copied per school — see §37.2.

---

## 11. Multi-Teacher Architecture (§35)

- `teacher_profiles` is a table, not a constant. The MVP's single teacher is one row.
- `student_profiles.assigned_teacher_id` implements the §35 Teacher → Students hierarchy.
- Teacher-facing queries filter by *her* students, not by the whole school — so adding Teacher B automatically isolates her roster without new logic.
- **§33 Teacher Attribution** renders from `teacher_profiles.display_name`. The name never appears as a literal in the UI; changing the account updates the display automatically (§33 explicit).

---

## 12. Tenant Isolation (§38)

Defense in depth — four independent barriers:

| # | Barrier | Fails safe if… |
|---|---|---|
| 1 | Token carries `school_id`; never accepted from the request body/query | …a client tries to spoof a tenant |
| 2 | Data access layer injects the tenant filter automatically | …a developer forgets a `WHERE` clause |
| 3 | PostgreSQL **Row-Level Security** on tenant tables | …the application layer has a bug (§37 "Database-Level Data Protection") |
| 4 | Cross-tenant FK integrity constraints | …a write tries to link across schools |

Barrier 3 is what makes this genuinely "database-level" rather than "application-level with a database". Automated isolation tests (§32) are mandatory, not optional.

---

## 13. API Architecture (§43, §52)

### 13.1 Conventions **[P]**

- Versioned base path `/api/v1` — a mobile app pinned to v1 keeps working when the web moves to v2.
- REST resources, JSON, consistent envelope for errors, cursor pagination on list endpoints.
- All mutating endpoints validated against a schema before touching the domain.
- Server-authoritative: the client never sends a score, a correctness flag, or a completion status.

### 13.2 Module surface (indicative, not exhaustive)

| Area | Endpoints (shape) |
|---|---|
| Auth | login, refresh, logout, forgot-password, reset-password |
| Me | profile, overall progress, notifications, unread counts |
| Content (read) | courses, units, unit detail, vocabulary, grammar |
| Learning | mark vocabulary item viewed/heard, mark grammar complete |
| Activity | start attempt, save progress (auto-save), submit, view result |
| Assessment | eligibility check, start attempt, save, submit, results, attempts remaining |
| Progress | unit progress, overall progress |
| Messaging | threads, messages, send, mark read |
| Notifications | list, mark read, register/unregister push device |
| Teacher | students CRUD, disable, delete, reset password, roster progress, results, send feedback |
| Teacher content | units/vocabulary/grammar/activities CRUD, questions CRUD |
| Admin | schools, teachers, system settings |

### 13.3 Critical API rules

1. **Answer keys are never serialised to any client**, in any endpoint, in any role's response, including teacher preview endpoints for in-progress attempts.
2. **Grading happens only on the server** (§37, §47).
3. **Eligibility (§16) and attempt limits (§18) are enforced on the server** — a client that calls "start attempt" a third time is rejected regardless of what the UI shows.
4. Every list endpoint is tenant- and ownership-scoped by construction.

---

## 14. Question Engine (§10, §11, §12, §46)

This is the core extensibility mechanism of the platform.

### 14.1 Design: registry + handler contract

A question type is defined in **two** places only:

1. A row in `question_types` (metadata + authoring schema).
2. A **handler** registered in the engine implementing one shared contract.

| Contract operation | Responsibility |
|---|---|
| Validate authoring input | Reject malformed question payloads when a teacher saves (§30) |
| Build presentation | Produce the client-safe payload **with the answer key stripped**, applying seeded shuffling |
| Grade response | Compare a student response to the answer key and return correct/incorrect + points |
| Describe result | Produce reviewable feedback data (what was chosen vs. expected) |

**Adding a 10th question type = one new handler + one row. No change to attempts, scoring, progress, UI routing logic, or database schema.** That is the §10 extensibility requirement satisfied structurally rather than by promise.

### 14.2 Types present in the current curriculum (§10)

Multiple Choice · Matching · True/False · Word Ordering · Missing Letter · Picture Matching · Spelling · Short Answer · Grammar Transformation

These are seeded as **data rows**, not as an enum in code. **The engine has no notion of "the nine types".**

### 14.3 Mixed types in one set (§12)

Because presentation and grading are delegated per-question to that question's handler, a set containing five different types requires no special handling — this falls out of the design rather than being a feature.

### 14.4 Randomization (§11) — seeded and reproducible

```text
Attempt starts  →  generate seed  →  store seed on the attempt
                                     │
Question order  ←── derived from seed ──→  Option order (per question)
                                     │
Student closes page and returns  →  same seed  →  IDENTICAL order restored
```

Storing the seed is what makes randomization compatible with **auto-save/resume (§23)**. Without it, a returning student would see reshuffled questions and could lose or mismatch answers. Shuffling is controlled per set by `shuffle_questions` / `shuffle_options` flags.

**[T]** §55 leaves open the *exact* randomization behaviour, specifically **whether matching-question items shuffle independently on each side**. The handler exposes this as a configuration flag; the default is **not** decided here.

### 14.5 Question count (§9)

Never a constant. A set either uses all its questions or draws `question_count` at random. Adding a 40th question to a unit is a content operation with no code impact.

### 14.6 Grading complexity note **[P]**

Short Answer, Spelling and Grammar Transformation require text comparison. Normalisation rules (case, whitespace, punctuation, accepted alternative answers) are **configurable per question**, because a single global rule will produce wrong results for at least one of these types. Accepted-answer lists live in `answer_key`.

---

## 15. Assessment Engine (§15–§19, §46, §47)

### 15.1 Attempt lifecycle

```text
Eligibility check (§16)  →  passed?  ──no──►  blocked, reason returned
        │yes
Attempt limit check (§18) →  attempts_used < max_attempts?  ──no──►  blocked
        │yes
Create attempt (seed, snapshot, policy_snapshot)
        │
Student answers  →  auto-save per response (§23)
        │
Submit  →  server-side grading  →  score  →  pass/fail vs configured threshold
        │
Persist result  →  update progress (§20)  →  emit ResultPublished event  →  notify (§25)
```

### 15.2 Scoring (§47)

Recorded per attempt: correct count, incorrect count, score percentage, pass/fail, attempt number — exactly the five items §47 requires. Also recorded: the **threshold that was applied** and a **policy snapshot**, so a later configuration change never makes historical results unexplainable.

### 15.3 Passing score (§17)

Default **80**, seeded as a Settings row, resolvable per assessment/unit/course/school. `79 → Fail`, `80 → Pass` — the comparison is `>=`, matching the §17 examples exactly. **Not a code constant.**

### 15.4 Attempts and retake (§18)

`max_attempts` default **2**, from Settings. The server rejects attempt 3. Enforced at the API, not the UI.

### 15.5 Official result policy (§19) — **[T] NOT DECIDED**

The system stores **both** `best_score_percent` and the latest score on every unit progress row, and resolves "the official result" through a **pluggable policy** (`highest` | `latest`), read from Settings.

This means §19 can be answered **after** launch, and even changed later, without a migration or a rebuild — which is precisely what §19 asks for. Until you decide, no policy is treated as final. **A default must be chosen for the MVP to run — see §37.3.**

---

## 16. Progress Tracking (§20–§23)

### 16.1 Two distinct concepts — deliberately separated

This separation matters, because the SRS treats them differently:

| Concept | Status in SRS | Handling |
|---|---|---|
| **Completion** (is the unit done?) | **[C] Confirmed** — §16 lists exactly four conditions | Implemented as a firm rule |
| **Progress percentage** (how full is the bar?) | **[T] TBD** — §21 says weights are undecided | Implemented as a configurable formula |

Conflating these would force me to invent weights in order to compute completion. Keeping them separate means **completion works correctly today while the weighting question stays genuinely open.**

### 16.2 Completion gate (§16) — Confirmed logic

A unit is complete **only** when all four hold:
1. Vocabulary complete  2. Grammar complete  3. Interactive Activity complete  4. **Assessment passed**

The fourth is enforced strictly: a submitted-but-failed assessment never completes a unit (§16 explicit).

### 16.3 Progress percentage (§21) — configurable formula

```text
unit_percent = Σ (component_weight × component_completion)   ← weights from Settings [T]
overall_percent = aggregate across units                      ← formula from Settings [T]
```

Weights are stored, not compiled. **No weighting is proposed as final in this document.** For the system to render a bar before you decide, a placeholder distribution must be seeded — flagged in §37.4 as needing your approval, and explicitly marked as provisional in the UI.

### 16.4 Vocabulary completion (§22)

Tracked **per item** in `vocabulary_progress`, recording viewed and audio-played timestamps. The exact rule for "complete" (viewed only, or viewed + audio played) is **[T]** — §22 says "حسب آلية النظام" without fixing it. Implemented as a Settings-driven rule with both signals captured, so either rule can be applied retroactively to already-collected data.

### 16.5 Auto-save (§23)

- Responses persist **incrementally** as the student works, not only at submit.
- Attempt state + stored seed allow exact resume after page close, logout, or connection loss.
- **[P]** Client-side buffering with retry for brief disconnections; the server remains authoritative. §23's own wording ("وفق البيانات التي تم حفظها بنجاح") correctly acknowledges that only successfully saved data can be restored — the design does not promise more than that.

---

## 17. Vocabulary & Audio (§7, §22)

### 17.1 Requirement

Pronunciation is generated **automatically**. The teacher records nothing and uploads nothing (§7 explicit).

### 17.2 Design: audio provider adapter **[P — §55 leaves the technique open]**

```text
Vocabulary word  →  AudioProvider (pluggable)  →  audio to the student
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
  Browser TTS      Server-side TTS     Pre-generated file
  (Web Speech)     + cached files      (audio_url column)
```

| Option | Pros | Cons |
|---|---|---|
| Browser Web Speech API | Free, no storage, no per-word cost, instant | Voice/accent varies by device and browser; not guaranteed on every device |
| Server-side TTS + cache | Consistent voice everywhere, works offline-ish via cache, controllable accent | Cost per word, storage, extra infrastructure |
| Pre-generated files | Full control, best quality | Manual pipeline for every new word — conflicts with §30 easy content editing |

`vocabulary_items.audio_url` exists so any strategy can be adopted or mixed later. **This choice is deferred — see §37.5.** It is genuinely reversible.

---

## 18. Grammar (§8)

- Modelled as `grammar_lessons` (explanation) + `grammar_examples`, with optional linked exercises delivered through the **same Question Engine** — no parallel exercise system.
- Content comes **only** from the supplied TOP GOAL material. §8 and §32 forbid inventing grammar content, and the architecture provides no mechanism that would auto-generate curriculum content.
- Completion is tracked as a component in `component_progress`; the exact rule is aligned with §22-style tracking and is **[T]** in the same way.

---

## 19. Activities (§9, §12)

- One activity per unit today (4 total), modelled as rows — **not four hard-coded screens**.
- An activity references a `question_set`, so it supports mixed types and a variable question count natively (§12, §9).
- Activities run through the same attempt machinery as assessments (`target_type = activity`), which means auto-save, randomization and result review are shared code rather than duplicated.
- **[T/P]** Retry behaviour for activities is Provisional (§55) — configurable, and **not** governed by the §18 assessment limit of 2, which §18 defines for *assessments*. I have not applied the assessment limit to activities, because the SRS does not say to.

---

## 20. Educational Games Architecture (§13)

**The SRS is explicit that final game types are undecided and that the listed examples are not requirements. This section therefore designs a container, not games.**

- `games` table: `unit_id`, `game_type_key`, `title`, `config JSONB`, `status`.
- A **game type registry** mirroring the question type registry — a new game is a row plus a client-side renderer, no schema change (§13, §44).
- Game plays record through the same `attempts` machinery (`target_type = game`) so results and progress do not need a second subsystem.
- Whether games affect completion, score, or progress is controlled by Settings flags — **all currently unset, see §37.6.**

**Not designed here:** any specific game's mechanics. Matching Game, Memory Cards, Word Scramble, Drag & Drop and Sentence Builder are listed in §13 as *possibilities only* and are treated as such.

---

## 21. Gamification (§14)

Confirmed elements: Points, Stars, Progress Bar, Final Score, Correct/Incorrect counts, Retry.
Confirmed as **TBD**: how points and stars are actually calculated (§14, §56).

Design response:
- `points_ledger` is **append-only** and records *why* each award happened. If the formula changes later, history stays valid and totals can be recomputed.
- Stars derive from configurable thresholds rather than a stored star count, so a rule change does not require rewriting student records.
- **No point values or star thresholds are proposed in this document.**

---

## 22. Feedback & Messaging (§24)

### 22.1 Unified model

Feedback and messaging are the **same** underlying mechanism, distinguished by `kind` and by an optional context link:

```text
Thread (Teacher ↔ Student)
   └── Message
         ├── kind: message | feedback | note        (§24)
         └── context: Unit | Activity | Assessment | none   (§24)
```

This satisfies both §24 requirements at once: feedback can be attached to a Unit/Activity/Assessment, and the student can reply to it — genuine **two-way communication**, not one-way notices with a separate reply feature.

### 22.2 Access control

Only the two thread participants (plus admin) may read a thread. A student cannot enumerate threads, and cannot read a message addressed to another student, at API level (§37, §38).

### 22.3 Events

Sending a message emits an event consumed by the Notify module (§25) — messaging does not know about push, and push does not know about messaging.

---

## 23. Push Notifications (§25, §50)

### 23.1 Architecture: event → rule → notification → channel

```text
Domain event                    Notification rule        Delivery
─────────────────────────────   ──────────────────────   ─────────────────
FeedbackSent          ──┐
MessageSent           ──┤
AssessmentResultReady ──┼──►  notification_types  ──►  In-app record  (always)
(future event types)  ──┘      (data-driven, §50)  └─►  Push adapter  [T provider]
```

- **In-app notifications always work**, independent of any push provider. This is important: it means the feature is functional even before the §56 push-provider decision is made, and even for users who deny browser permission.
- Push delivery is an **adapter** — Web Push (VAPID), FCM, or another provider can be selected later without touching the notification logic. Provider is **[T] (§56)**.
- `push_subscriptions` already models `platform`, so a future mobile app registers devices through the same endpoint (§43).

### 23.2 Notification triggers (§25 — Confirmed)

| Recipient | Event |
|---|---|
| Student | Feedback received · Message from teacher · Assessment result published |
| Teacher | Message from a student · Reply to feedback |

New types are added as **rows** in `notification_types` (§50 extensibility).

### 23.3 Platform constraint you should know about **[Risk]**

Web push on **iOS Safari** requires the site to be installed to the Home Screen as a PWA (iOS 16.4+). On iPhone, a student who has not installed the app will **not** receive web push, no matter which provider is chosen. This is an Apple platform limitation, not a design flaw — but it affects expectations and is listed in §34 Risks. It is one of the strongest practical arguments for the future mobile app (§43).

---

## 24. WhatsApp (§26)

- Implemented as a **client-side deep link** (`wa.me` URL with a pre-filled, URL-encoded message). No WhatsApp Business API, no backend integration, no message storage — the SRS asks only for a button that opens WhatsApp with a prepared message.
- Teacher's number comes from `teacher_profiles.whatsapp_phone` — **not hard-coded** (consistent with §33).
- Message text is a **template with placeholders** (e.g. student name) stored in Settings, because §55 explicitly marks the wording as changeable. The §26 example (`Hello Teacher, this is Sara. I need your help.`) is seeded as the initial template value, not embedded in code.
- **Privacy note [Risk]:** this reveals the teacher's phone number to students and takes a minor off-platform into a third-party app. This is a client-confirmed requirement (§54.1) and I am implementing it as specified — flagging it only so the choice is conscious.

---

## 25. Content Management (§29, §30, §31, §32, §45)

### 25.1 Initial import (§29)

Source material is Microsoft Word. Pipeline:

```text
Word documents  →  structured extraction  →  canonical content JSON
                →  review/validation  →  import into database
```

The intermediate canonical format matters: it makes the import **repeatable and reviewable** rather than a one-off manual data entry, and it becomes the natural basis for a future Excel/bulk import (§31) without redesign.

**[T]** §56 leaves the final content-entry workflow open. Realistically the choice is between (a) an import tool run once by the developer, and (b) manual entry through the teacher CMS. See §37.7.

### 25.2 Ongoing editing (§30)

Full CRUD for the teacher over units, vocabulary, grammar, activities and questions — **with no code changes**, which is §30's actual requirement. Question authoring forms are generated from each type's `payload_schema`, so a new question type gets an authoring UI without bespoke form code.

### 25.3 Publishing & safety

- `draft` / `published` status so half-finished edits are not exposed to students. **[P]**
- Attempt snapshots (§4.3) ensure edits never corrupt historical results.
- Deleting a question that has been used in past attempts is a **soft delete** — history must remain readable.

### 25.4 Excel import (§31)

**Deferred, not designed away.** §31 explicitly says it is not required for v1. The canonical content format above is the extension point for adding it later (students, vocabulary, questions, content).

### 25.5 Content integrity rule (§32)

The platform provides **no mechanism to auto-generate curriculum content**. All educational content originates from the supplied TOP GOAL material and is entered by a human. This is an architectural constraint, in direct support of §32 and §57.

---

## 26. TOP GOAL Content Structure (§6, §32)

Structural model only, per §6:

```text
Course: TOP GOAL — Grade 6
│
└── Unit  (ordered; currently 4, stored as data)
      ├── Vocabulary   → items (word, meaning, part of speech, example, audio)
      ├── Grammar      → lessons (explanation, examples, exercises)
      ├── Activity     → question set (mixed types, variable count)
      ├── Games        → game definitions [types TBD §13]
      └── Assessment   → question set + scoring config
```

**Important limitation to state plainly:** the TOP GOAL curriculum material itself has **not yet been supplied to me** — only the SRS has. Therefore:

- This section defines the **container structure only**.
- Actual unit titles, vocabulary lists, grammar points and questions are **not** modelled, guessed, or drafted here (§32, §57).
- Content modelling may need minor refinement once the real material is reviewed — for example if a unit contains multiple grammar points or sub-lessons. The structure above accommodates that (lessons are 1:N), but I will confirm after seeing the material.

---

## 27. Responsive Web Architecture (§39, §40, §42)

- **Mobile-first** layout: the smallest viewport is designed first, then scaled up to tablet and desktop (§42). This is the opposite of shrinking a desktop design and produces materially better results on phones.
- **UI language: English throughout** — navigation, buttons, dashboard, labels, notifications, messages, forms (§39). Educational content renders as authored in the curriculum, which may include Arabic (e.g. vocabulary meanings, §7).
- **Bidirectional text:** the UI is English/LTR, but Arabic content appears inside it (Arabic meanings in vocabulary). Text direction is handled **per content field**, not per page — otherwise Arabic meanings render incorrectly inside an LTR layout. Flagging this because it is easy to miss and expensive to retrofit.
- **Design tokens, not fixed styles:** because §41 leaves logo, colors and typography TBD, all visual values are defined as tokens. Final branding is applied by changing token values, **not** by rewriting components.
- **Visual direction (§40):** Modern, cheerful, engaging, clean — appropriate for Grade 6, explicitly **not** styled for ages 6–7 and **not** dry/formal. No UI is being designed at this stage.
- **Accessibility & performance [P]:** keyboard navigation, sufficient contrast, adequate touch-target sizes, and attention to low-end Android performance — the realistic device profile for this audience.

---

## 28. Mobile App Readiness (§43)

The MVP is a web application. Readiness is achieved by **structural discipline**, not by extra work:

| Requirement | How it is satisfied |
|---|---|
| Reusable backend | All business logic lives in the API; the web client holds none |
| Reusable API | Versioned REST/JSON, no HTML-coupled or session-page-coupled endpoints |
| Reusable auth | Token-based from day one; mobile receives tokens in the response body (§8.2) |
| Reusable database | No web-specific assumptions in the schema |
| Push readiness | `push_subscriptions.platform` already models ios/android |

**Litmus test applied to every design decision:** *could a native mobile app perform this exact operation using only the public API?* If not, the logic is in the wrong layer. No mobile app is built in v1 (§43 explicit).

---

## 29. Security (§37, §38)

### 29.1 Checklist mapped to §37

| Requirement | Design response |
|---|---|
| Authentication | Argon2id hashing, token-based sessions, rotation, revocation |
| Authorization | Deny-by-default, role + tenant + ownership on every endpoint |
| RBAC | Roles as data with an explicit permission map (§7) |
| Tenant isolation | Four independent barriers (§12) |
| Database-level protection | PostgreSQL Row-Level Security |
| Password hashing | Argon2id; never logged, never returned |
| Secure sessions | httpOnly/Secure/SameSite cookies (web), rotating refresh tokens, server-side revocation |
| Input validation | Schema validation at the API boundary on every mutating request |
| API authorization | Enforced in the API layer, before the domain |
| Server-side permission checks | The **only** place authorization is decided |

### 29.2 Additional controls **[P]**

- HTTPS everywhere; HSTS; secure headers; CSRF protection for cookie-based flows.
- Rate limiting on authentication and messaging endpoints.
- **Answer keys never leave the server** — treated as a security asset, not just a data field.
- Non-enumerable public IDs (UUIDs).
- Audit logging of destructive/sensitive teacher actions (delete student, reset password).
- Secrets in environment configuration, never in the repository.
- Dependency vulnerability scanning in CI.
- Structured logging that **excludes** credentials and personal data.
- Automated backups with a tested restore procedure.

### 29.3 Minors' data — **[Risk / advisory]**

All students are children (Grade 6). The SRS does not state a jurisdiction or a data-protection regime, and **I am not inventing one**. Practical consequences worth your attention:

- Collect the minimum: the SRS requires only Name, Username, Password — I recommend not adding fields beyond what a feature genuinely needs.
- Be deliberate about any feature that moves a student off-platform or exposes contact details (see §24 WhatsApp note).
- Data retention and deletion policy: **[T]** not specified in the SRS.

---

## 30. Scalability (§44)

| Dimension | Why it scales |
|---|---|
| Units, lessons, vocabulary | Rows; ordering by `order_index`, no positional constants |
| Questions | Rows; sets support variable and random counts |
| **Question types** | Registry + handler — new type never touches the schema |
| Games | Registry + renderer, same pattern |
| Teachers, schools, students | Tenant model present from day one |
| Assessments | FK-based, not 1:1-locked in code |
| Notifications | Type registry + channel adapters |

Performance measures **[P]**: indexes on tenant and ownership columns and on progress lookups; pagination on all lists; optional materialised overall-progress for teacher roster views if the roster grows. Caching is deliberately **not** introduced in the MVP — at this data scale it would add cache-invalidation bugs for no measurable gain.

---

## 31. Project Folder Structure **[P]**

```text
courses-platform/
├── docs/
│   ├── SRS.md                    # source of truth (§59)
│   ├── ARCHITECTURE.md           # this document
│   └── decisions/                # ADRs — one file per binding decision
│
├── apps/
│   ├── api/                      # backend (NestJS)
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── identity/     auth, users, password reset
│   │   │   │   ├── tenancy/      schools, scope resolution
│   │   │   │   ├── content/      courses, units, vocabulary, grammar
│   │   │   │   ├── questions/    engine, type registry, handlers/
│   │   │   │   ├── assessment/   attempts, scoring, policies/
│   │   │   │   ├── progress/     tracking, completion, formulas/
│   │   │   │   ├── games/        definitions, sessions
│   │   │   │   ├── gamification/ points ledger
│   │   │   │   ├── messaging/    threads, messages, feedback
│   │   │   │   ├── notifications/ records, channels/ (push adapters)
│   │   │   │   ├── settings/     configuration resolution
│   │   │   │   └── audit/
│   │   │   ├── common/           guards, interceptors, validation, errors
│   │   │   └── infra/            db, audio adapter, push adapter
│   │   ├── prisma/               schema + migrations (not created yet)
│   │   └── test/
│   │
│   └── web/                      # frontend (Next.js)
│       ├── src/
│       │   ├── app/              routes: (auth) (student) (teacher) (admin)
│       │   ├── features/         one folder per domain feature
│       │   ├── components/       shared UI primitives
│       │   ├── lib/              api client, auth, hooks
│       │   └── styles/           design tokens (branding TBD §41)
│       └── test/
│
├── packages/
│   ├── shared-types/             API contract types shared by web & mobile
│   └── content-schema/           canonical content format (§25.1)
│
└── tooling/
    └── content-import/           Word → canonical JSON pipeline (§29)
```

The `handlers/`, `policies/`, `formulas/` and `channels/` folders are where extensibility physically lives — each is a place to **add a file**, never to edit a switch statement.

---

## 32. Development Phases

Each phase is independently reviewable. **No phase begins before you approve this architecture (§52, §60).**

| Phase | Scope | Depends on |
|---|---|---|
| **0. Foundation** | Repo setup, stack scaffolding, DB connection, CI, migrations baseline, settings module | ✔ Unblocked — stack confirmed (§37.8) |
| **1. Identity & Tenancy** | Schools, users, roles, login, tokens, RBAC, tenant scoping + RLS, audit log | Student recovery decision **[T §36.1]** |
| **2. Student Management** | Teacher CRUD over students, disable/delete, password reset, roster | Phase 1 |
| **3. Content Model & CMS** | Courses, units, vocabulary, grammar; teacher content CRUD; publishing | Phase 1 |
| **4. Question Engine** | Type registry, handlers for the 9 current types, authoring, validation, randomization | Phase 3 · Curriculum material |
| **5. Learning Experience** | Student unit view, vocabulary + audio, grammar, activities, auto-save | Phase 4 · Audio decision **[§37.5]** |
| **6. Assessment** | Attempts, eligibility, limits, grading, scoring, results, retake | Phase 4 · Result policy **[§37.3]** |
| **7. Progress** | Component/unit/overall progress, completion gate, dashboards | Phase 6 · Weights **[§37.4]** |
| **8. Communication** | Threads, feedback, two-way messaging, WhatsApp button | Phase 2 |
| **9. Notifications** | In-app notifications first, then push adapter | Phase 8 · Provider **[§56]** |
| **10. Gamification** | Points ledger, progress bar, stars | Rules **[§14 TBD]** |
| **11. Games** | Game container + agreed game types | **Blocked on §13 TBD** |
| **12. Hardening** | Security testing, performance, accessibility, content load, UAT | All |

**Content import (§25.1) runs in parallel from Phase 3**, since it depends on the curriculum material rather than on code.

Note the ordering logic: **Identity and tenant isolation come first**, because retrofitting them is the single most expensive class of change in this application. Games come last, because their requirements are the least settled.

---

## 33. Testing Strategy

| Level | Focus | Priority |
|---|---|---|
| **Unit** | **Question type handlers — grading correctness for all 9 types**, scoring maths, pass/fail boundary (79/80), progress formulas, settings resolution | **Highest** |
| **Integration** | API endpoints with real database: authorization, attempt limits, eligibility, auto-save/resume | High |
| **Security** | See below | **Highest** |
| **E2E** | Student journey (login → vocabulary → grammar → activity → assessment → result → progress); teacher journey (create student → view progress → send feedback) | High |
| **Responsive** | Mobile/tablet/desktop breakpoints (§42) | Medium |
| **Accessibility** | Keyboard, contrast, touch targets | Medium |

### 33.1 Mandatory security test suite

These are **not optional**, because §37 states the requirement in adversarial terms:

1. Student A requests Student B's attempt/result/progress by ID → **must fail at the API**.
2. Student calls a teacher endpoint directly → **must fail**.
3. Cross-school request with a valid token from another school → **must fail**.
4. Attempt to submit a third assessment attempt → **must fail** (§18).
5. Attempt to start an assessment without completing prerequisites → **must fail** (§16).
6. **No API response, in any role, ever contains an answer key.**
7. Client-supplied score/completion values are ignored by the server.

### 33.2 Boundary cases worth naming explicitly

- 79% vs 80% pass boundary (§17 examples) — tested as data, including when the threshold is reconfigured.
- Resume after disconnect returns the **identical** question/option order (seeded randomization + §23).
- Editing a question after an attempt does **not** change the historical result.

---

## 34. Deployment **[D — target not yet chosen]**

The SRS does not specify hosting. Options, to be decided with you:

| Option | Fit |
|---|---|
| Managed platforms (e.g. Vercel + a managed Node host + managed PostgreSQL) | Fastest to operate, low maintenance, good default for this size |
| Single VPS with containers | Cheapest at small scale, more manual operations, full control |
| Regional hosting | May matter if data residency is required — **not stated in the SRS** |

Regardless of target, the following are **[P]** requirements of the deployment design:

- Separate **staging** and **production** environments.
- Versioned, reversible database migrations — no manual schema edits in production.
- Configuration and secrets via environment variables.
- Automated backups **with a tested restore**.
- Error monitoring and uptime checks.
- HTTPS enforced.

**Considerations that need your input:** expected number of students, budget, whether data must reside in a specific country, and who maintains the system after handover.

---

## 35. Risks & Technical Challenges

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **Nine question types is the largest build item** — each needs authoring UI, rendering, and grading | Schedule | Registry design keeps cost linear; sequence by curriculum frequency; the engine itself is built once |
| 2 | **Grading free-text types** (Spelling, Short Answer, Grammar Transformation) produces false negatives — a correct answer marked wrong | Student trust, teacher workload | Per-question accepted-answer lists + configurable normalisation; teacher review of flagged responses **[P]** |
| 3 | **iOS web push requires PWA installation** (§23.3) | Feature expectation | Set expectations now; in-app notifications always work; strengthens the case for the mobile app |
| 4 | **Word → structured content conversion** is manual-heavy and error-prone | Schedule, content accuracy | Canonical intermediate format + validation + teacher review before publishing |
| 5 | **TBD items block finishing phases** (progress weights §21, result policy §19, games §13) | Schedule | Configurable defaults let development proceed; each is a small, isolated decision later |
| 6 | **Student password recovery has no delivery channel** (§8.3) | Blocks a Confirmed requirement | Decision required — §36.1 |
| 7 | **Audio quality varies by device** with browser TTS | Learning quality | Adapter allows switching to server-side TTS without rework |
| 8 | Curriculum material not yet reviewed | Content model may need refinement | Structure is deliberately generic; confirm after material review |
| 9 | Multi-tenant design costs effort not visible in a one-school MVP | Perceived over-engineering | It is required by §34/§38, and retrofitting is far more expensive than including it now |
| 10 | Minors' data and off-platform contact (§24, §29.3) | Compliance/privacy | Data minimisation; conscious client decision on WhatsApp |
| 11 | Scope creep into unrequested features | Schedule | Anything not in the SRS is not built (§57) |

---

## 36. Assumptions

Stated explicitly so you can correct any of them. **None of these is treated as a confirmed requirement.**

1. The four units are **current content**, not a permanent system limit (§9, §44) — the system will function identically with 5 or 20 units.
2. "Female students" (§54.1) describes the user population; it is **not** implemented as a gender field or an access restriction. No such field is proposed. **Please correct me if a gender attribute is actually required.**
3. Students access the platform in a normal web browser on phone, tablet, or laptop (§42).
4. Internet connectivity is intermittent but generally available — the design targets resilient auto-save (§23), **not** full offline operation, which the SRS does not request.
5. One teacher account and one school at launch (§4, §34), with the model supporting more.
6. Educational content is authored by a human from the supplied TOP GOAL material (§32).
7. Arabic appears in *content* (vocabulary meanings); the *interface* is English (§7, §39).
8. Admin functionality in the MVP is structural, with advanced dashboards deferred (§36, §53).

---

## 37. Open Decisions — I need your answers

These are **not** design gaps; they are points where the SRS is deliberately open (§55, §56) or silent, and where §57 forbids me to decide silently. Development can begin before all are answered, except where noted.

### 37.1 Student password recovery channel — **blocks Phase 1**
§28 grants students self-service recovery, but §27 defines student accounts with **no email or phone**. Options:
- (a) Teacher-only reset — students always ask the teacher (§28 already grants this; simplest and safest for minors).
- (b) Add an optional student email field.
- (c) Add a guardian email field.
- (d) Security-question style recovery.

*My recommendation: (a) for the MVP, with (b) available later.* But this is your call, since (a) narrows a Confirmed requirement.

### 37.2 Is content shared across schools or copied per school?
Affects whether a future School B sees the same TOP GOAL content, and whether one teacher's edits affect another school. *Recommendation: shared course library for now, since only one school exists — the model supports per-school copies later.*

### 37.3 Official result policy (§19) — highest vs. latest
Both scores are stored either way. A default must be selected so assessments can run. **Which do you want as the interim default?**

### 37.4 Progress weights (§21)
No weighting is proposed here. A placeholder distribution is needed to render a progress bar. **Do you want to decide the weights now, or approve a clearly-labelled provisional split until you decide?**

### 37.5 Audio approach (§7, §55)
Browser TTS (free, quality varies) vs. server-side TTS (consistent, ongoing cost). **Is there a budget for per-word TTS?**

### 37.6 Games (§13, §56) — and a conflict to resolve
§16 lists unit completion as Vocabulary + Grammar + Activity + Assessment — **games are not among them**. But §56 lists "whether games affect unit completion" as still open. **These two statements are in tension.** I have implemented §16 as written (games do **not** gate completion) and left the flag configurable — please confirm this reading. Also open: game types, count per unit, effect on score/progress.

### 37.7 Initial content entry workflow (§56)
Developer-run import from Word, or manual entry by the teacher through the CMS? Affects Phase 3–4 effort.

### 37.8 Technology stack — **[C] CONFIRMED — no longer blocks Phase 0**
Client approved Option A on 2026-08-30: Next.js (web) + NestJS (API) + PostgreSQL, separate web and API deployments, token-based authentication, API designed for future mobile reuse.

**Still open:** the hosting *provider* (§34) is a separate decision and remains unresolved. It does not block Phase 0 — it is needed before the first deployment, around the end of Phase 1.

### 37.9 Teacher email / recovery channel
§28 requires teacher password recovery, but no email field is specified. Confirm that teacher accounts will have an email address.

### 37.10 Curriculum material
The TOP GOAL content has not yet been supplied. It is required before Phase 4.

---

## 38. TBD Register (mirrors SRS §55–§56, plus items found during analysis)

| ID | Item | SRS | Status |
|---|---|---|---|
| T-01 | Highest vs. latest official score | §19, §56 | Open — pluggable policy ready |
| T-02 | Progress weights (Vocabulary/Grammar/Activity/Assessment) | §21, §56 | Open — configurable formula ready |
| T-03 | Overall progress formula | §21, §56 | Open |
| T-04 | Points calculation | §14, §56 | Open — ledger ready |
| T-05 | Stars calculation | §14, §56 | Open — threshold-based |
| T-06 | Final game types | §13, §56 | Open — container ready |
| T-07 | Games per unit | §13, §56 | Open |
| T-08 | Whether games affect completion/score/progress | §13, §56 | Open — **see §37.6 conflict** |
| T-09 | Branding: logo, colors, typography | §41, §56 | Open — design tokens ready |
| T-10 | Admin dashboard scope | §36, §56 | Open — structure ready |
| T-11 | School/teacher management workflows | §56 | Open |
| T-12 | Initial content entry workflow | §56 | Open — see §37.7 |
| T-13 | Excel import in MVP | §31, §56 | Deferred, extension point ready |
| T-14 | Content import format | §56 | Open — canonical format proposed |
| T-15 | Push notification provider | §25, §56 | Open — adapter ready |
| T-16 | Notification permission flow | §56 | Open |
| T-17 | Notification settings | §56 | Open |
| T-18 | Exact randomization behaviour | §55 | Configurable |
| T-19 | Matching items randomized independently | §55 | Configurable flag |
| T-20 | Activity retry behaviour | §55 | Configurable |
| T-21 | Audio implementation technique | §7, §55 | Open — adapter ready, see §37.5 |
| T-22 | WhatsApp message wording | §26, §55 | Template in Settings |
| T-23 | Vocabulary completion rule (viewed vs. audio played) | §22 | Both signals captured |
| T-24 | **Student password recovery channel** | §28 | **New — blocks Phase 1 (§37.1)** |
| T-25 | **Teacher email/recovery channel** | §28 | **New (§37.9)** |
| T-26 | **Content shared vs. per-school** | §34 | **New (§37.2)** |
| T-27 | Technology stack (Option A) | — | **RESOLVED — client-approved, see §2 / §37.8** |
| T-27b | Hosting provider | §34 | Open — needed before first deploy, not Phase 0 |
| T-28 | Data retention/deletion policy for minors | §29.3 | Not specified in SRS |

---

## 39. MVP Scope Confirmation (§53)

The MVP is exactly §53 — no more. Restated with architectural notes:

**Student:** Login · Password recovery *(pending §37.1)* · Units · Vocabulary · Audio · Grammar · Interactive Activities · Assessment · Progress · Feedback · Messaging · Notifications

**Teacher:** Login · Student Management · Content Management · Question Management · Progress Monitoring · Results · Feedback · Messaging · Notifications

**Admin:** Structural only — schools/teachers/users exist in the model; advanced dashboards deferred (§36, §53).

### Explicitly NOT in the MVP
Mobile app (§43) · Excel import (§31) · Advanced admin dashboards (§36) · Games beyond the container *(§13 TBD)* · Any feature not present in the SRS (§57).

### What I deliberately did not add
No classes/sections entity · no parent/guardian role · no analytics platform · no AI content generation · no offline mode · no leaderboards or social features · no gender field. **None of these appear in the SRS.**

---

## 40. Requirements Traceability

| SRS area | Covered in |
|---|---|
| §1–§5 Overview, users, roles | §7 |
| §6 Educational structure | §5.2, §26 |
| §7 Vocabulary & audio | §5.2, §17 |
| §8 Grammar | §5.2, §18 |
| §9, §12 Activities, mixed questions | §5.3, §14, §19 |
| §10, §11 Question types & randomization | §14 |
| §13 Games | §20 |
| §14 Gamification | §21 |
| §15–§19, §46–§48 Assessment | §15 |
| §16, §20–§23, §49 Progress & auto-save | §16 |
| §24 Feedback & communication | §22 |
| §25, §50 Notifications | §23 |
| §26 WhatsApp | §24 |
| §27, §28 Student management & recovery | §5.1, §8 |
| §29–§32, §45 Content management | §25, §26 |
| §33 Teacher attribution | §5.1, §11 |
| §34–§36 Multi-school/teacher/admin | §10, §11, §12 |
| §37, §38 Security & isolation | §9, §12, §29 |
| §39–§42 UI, branding, responsive | §27 |
| §43 Mobile readiness | §28 |
| §44 Scalability | §30 |
| §52 Required architectures | §3.3 and throughout |
| §53 MVP scope | §39 |
| §55, §56 Provisional & TBD | §37, §38 |
| §57–§59 Development rules | §0, §36, §37 |

---

## 41. Status & Next Step

**This document contains no implementation code, no UI, and no database.** Per SRS §52 and §60, implementation begins only after your approval.

**Awaiting from you:**
1. Approval (or correction) of this architecture.
2. Answers to the blocking decisions: **§37.8** (stack/hosting) and **§37.1** (student password recovery).
3. The TOP GOAL curriculum material (needed by Phase 4).

Decisions you approve will be recorded as ADRs in `docs/decisions/`, so that the reasoning behind each binding choice remains visible and reversible where possible (§57, §59).

**I am stopping here and awaiting your approval before writing any code.**
