# TOP GOAL source material — what the file actually contains

Findings from `Top_Goal_3_Term_1_answers.docx`, supplied 2026-08-30, recorded
so the content model can be checked against the real material rather than an
assumption. **No curriculum content was copied, reworded or corrected.**

## The document

- **Top Goal 3 — Revision Worksheets, Grade 6, Term 1**
- 23 MB, 92 images, ~1,600 paragraphs
- Contains **answers**, marked with yellow highlighting

## Structure

Six top-level blocks:

| Block | Kind |
|---|---|
| Welcome | Preliminary |
| Living Things | Themed unit |
| Lifestyles | Themed unit |
| Interests | Themed unit |
| Professions | Themed unit |
| Grammar Review | Revision across Units 1–4 |

Each unit is divided into **nine numbered sections**:

1. General Question
2. Controlled Writing
3. Reading
4. Grammar
5. Vocabulary
6. Orthography
7. Handwriting
8. Writing
9. Reading Passage

Vocabulary is given as English/Arabic pairs.

## Mismatches against the approved documents

| # | Finding | SRS reference | Status |
|---|---|---|---|
| 1 | Nine section kinds; the SRS names only Vocabulary, Grammar, Activity, Games, Assessment | §6 | Handled — section kinds are data, not code |
| 2 | Six blocks, not four units. The four themed units do match; Welcome and Grammar Review are extra | §6, §54.1 | **Needs a decision** — see below |
| 3 | Progress weighting is confirmed as four equal quarters, but units have nine kinds of section | §21 | **Needs a decision** |
| 4 | Unit completion is defined over four components; Reading, Writing, Orthography and Handwriting are not among them | §16 | **Needs a decision** |
| 5 | Handwriting and Orthography are paper exercises | — | Handled — marked `isPaperBased`, shown for reference |
| 6 | The material is image-heavy and some exercises are only meaningful with their picture | §10 | Handled — `media_assets` added |
| 7 | Answers exist but are marked by yellow highlighting, not structure. Word splits runs mid-word, so extraction is imperfect | §46, §47 | Affects Phase 4 import |
| 8 | The file carries a restriction on sharing, and names an editor who is not the client | §51 | **Needs a decision — see below** |

## Open decisions

**Welcome and Grammar Review.** Are these units students work through, or
reference material? It changes what "all units complete" means.

**Where the extra sections fit.** Reading, Writing, Controlled Writing,
Orthography and Handwriting are real parts of the curriculum but sit outside
the confirmed four-component model for completion (§16) and progress (§21).

**Rights to the material.** The file states, in Arabic, that it may not be sold
or shared other than to the purchaser, and is credited to an editor who is not
the client. §51 assumes the client owns the content. Publishing it to students
through the platform should be confirmed with the client before any import.

## Consequences for Phase 4

- Answer keys can be recovered from the yellow highlighting, but each will need
  checking: Word splits text mid-word, so some extracted answers are fragments.
- Images must be extracted alongside the text; several exercises make no sense
  without them.
- This is a revision worksheet pack, not the textbook. Whether it is the
  primary source or a supplement is for the client to say.

---

# Phase 4 — what the import actually produced

Extraction is deterministic: two runs over the same file produce byte-identical
output apart from the timestamp.

## Counts

79 questions, every one imported as a DRAFT.

| Kind | Count |
|---|---|
| Multiple choice | 30 |
| Complete the sentence | 24 |
| Odd one out | 16 |
| True / false | 9 |

| Block | Questions |
|---|---|
| Welcome | 8 |
| Living Things | 21 |
| Lifestyles | 8 |
| Interests | 21 |
| Professions | 14 |
| Grammar Review | 7 |

256 further parts of the file could not be read as questions at all — reading
passages, handwriting and copying exercises, and picture tasks whose meaning is
in the image. They are reported, not guessed at, and stay for manual entry.

## Further mismatches found during the import

| # | Finding | SRS reference | Status |
|---|---|---|---|
| 9 | "Circle the odd one out" is a real exercise kind in the file — 4 distinct instructions, 16 questions — but §10 does not list it | §10 | Handled — added as a question type; it is a row, not code |
| 10 | Grammar Transformation is named in §10 but does not occur anywhere in the file | §10 | Registered and left unused. No content was invented to fill it |
| 11 | The file has no matching, ordering, spelling, short-answer, picture-matching or missing-letter exercises, though §10 names them | §10 | Registered and supported by the engine; zero imported |

## The three questions a teacher must check

All three are the same fault: Word split a word across formatting runs, so the
highlighted answer is a fragment that matches no option. None was guessed at.

| Source | Prompt | Highlighted | Options |
|---|---|---|---|
| p104 | How ………. is the English lesson? | `ong` | long / much / many |
| p1140 | Circle the odd one out of family group | `invite` | correction / education / "reaction- invite" |
| p1168 | What do drums make? | `ounds` | pictures / games / sounds |

The middle one is ambiguous in the source itself: the third option and the
highlighted answer have run together, so what the exercise intends cannot be
read from the file. It is flagged rather than resolved.

## What the import will not do

- It never invents an accepted alternative for a typed answer. Where the source
  gives one answer, one answer is stored.
- It never files a question under a unit it could not read. 79 of 79 were
  placed; anything unplaceable would have been reported and left out.
- A question whose answer could not be read is imported without one, marked,
  and refused publication until a teacher confirms it.

---

# Phase 5 — what the learning flow revealed

## A decision the material forces

Nine kinds of section exist in this file; SRS 16 and 21 define completion and
progress over four components. Rather than pick a mapping and write it into the
code, which kinds count is now a column on the section type
(`section_types.progress_component`):

| Section kind | Counts towards |
|---|---|
| Grammar | grammar |
| Vocabulary | vocabulary |
| General Question, Controlled Writing, Reading, Orthography, Handwriting, Writing, Reading Passage | nothing yet |

A student can read all of them; only the two above move her progress bar.
Changing that is an `UPDATE` on one column, not a change to the platform. The
open decision from Phase 3 (mismatches 3 and 4) is unchanged — this records it
rather than settling it.

## Assessment is named, not guessed

`progress.weights` gives assessments a quarter of the total, and assessments were
Phase 6. Progress therefore reported `notCounted: ["assessment"]` and left that
weight out of the calculation, rather than counting it as zero — which would
make a finished unit read as three-quarters done — or as complete, which would
be untrue.

**Superseded by Phase 6.** All four components are now produced, so
`notCounted` is empty. The mechanism stays for a weight the settings carry that
the platform does not produce, and a test holds it there.

## Pronunciation depends on the device, not only the browser

The approved approach is the browser's own voice (SRS 7). Having the speech API
is not the same as being able to speak: a browser with no voice installed
accepts the request and then fails. Because a word is not learned until it has
been heard (SRS 22), that makes a unit impossible to finish on such a device.

The platform now detects this and says so plainly instead of asking her to try
again at something that cannot work. **It does not mark the word as heard.**
Whether a student on a voice-less device should be able to complete vocabulary
some other way is a decision for the client, not one to take quietly.

---

# Additions after Phase 5, before Phase 6

## Vocabulary now needs a check answered

Reading a word and hearing it can both be done by tapping through the cards, so
neither, nor both together, finishes a word any more. She must also answer a
short check on it. SRS 22 is amended by the client's instruction of
2026-08-30, and the setting `vocabulary.completion_rule` carries the change
from `seen_and_audio_played` to `seen_audio_and_checked`.

**The check is built only from what the teacher entered.** The word, her Arabic
meaning for it, and — as the wrong choices — other words' meanings from the
same unit. Nothing is written, translated or shortened by the platform.

Where a unit does not hold enough real material, no question is asked:

| Situation | What happens |
|---|---|
| The word has no Arabic meaning | No check. The teacher is told the word has nothing to check against |
| Fewer than three words in the unit have meanings | No check. The teacher is told the unit needs at least three |

In both cases the word stays at read-and-heard and **cannot be completed**.
That is the instruction followed exactly, and it is a live consequence worth
naming: a unit whose word list is thin cannot be finished until the teacher
adds more meanings.

## Where grammar pictures are kept

Uploaded pictures are stored in the database, capped at 2 MB, and served by the
API from its own route with `nosniff`, `Content-Disposition: inline` and a
locked-down `Content-Security-Policy`. SVG is refused: it is a document that
can carry script, and this one would be served from the API's own origin.

This is a choice for the size of the pilot, not a permanent one. It needs no
new service, works the moment the API is deployed, and everything that reads a
picture reads `media_assets.url` — so moving to object storage later is a
migration behind that column. Revisit if the picture library grows, which it
will if the 92 curriculum images are ever extracted.

---

# Phase 6 — what building the assessment revealed

## The four core units are a flag, not a rule

The client confirmed on 2026-08-31 that Welcome and Grammar Review are
preliminary and revision material: finishing them must not affect the
completion of the themed units or of the course.

That is data, not code. `units.counts_toward_completion` was added and the two
units were set to false by a one-time correction in the migration, matched on
the two titles the client named. Nothing in the application reads a unit title,
and no number of units is written anywhere: a teacher can flip the flag on any
unit, and a sixth themed unit needs no change.

## Assessments reuse the attempt machinery

They were built as a `purpose` on a question and on an attempt, not as tables
of their own. The engine, the marking, the frozen snapshots and the review
screen are identical for practice and assessment; only the pool drawn from and
the rules around it differ, and those rules all come from the settings store —
80% to pass, two tries, highest counts (SRS 17, 18, 19). A second copy would
only have given the two a way to drift apart.

`activity_attempts.pass_mark_percent` is written at submission alongside the
score. Lowering the mark next term must not turn a fail already recorded into a
pass, for the same reason editing a question does not change what a student was
asked.

## Two question kinds had no working student view

Matching and word-ordering send `left`/`right` and `tokens` in their payload
rather than `options`. The screen had three branches — options, true/false,
and a text box for everything else — so both fell through to the text box and
were, in practice, unanswerable. The engine had marked them correctly since
Phase 4; nothing had ever put one in front of a student.

They are now tap-to-place: tap one side then the other to pair, tap words into
a sentence and tap one to take it back. **Dragging is offered as well, but
tapping is the primary mechanism, which is a deliberate departure from the
"drag/match, drag-to-order" wording of the request.** HTML5 dragging does not
work on a touchscreen at all, and these students are on phones; a drag-only
version would have left exactly those two kinds unanswerable on exactly the
devices that matter. Pointer-based dragging that works on touch is possible
later if the client wants it.

## The audio fallback cannot be a checkbox

A student may not claim to have heard a word (client, 2026-08-31). The route
now takes what actually played it, and the server refuses a teacher's recording
for a word that has none, and refuses a request that names nothing — which is
what a button reading "I heard it" would send.

The browser-voice claim cannot be verified from the server: the API cannot
watch a browser speak. What stops it is that the screen only sends after
playback has finished, and there is no control that sends without playing. This
is stated rather than glossed: it is an honest limit of doing text-to-speech in
the browser, which is the approved provider (SRS 7, `audio.provider`).

A teacher's recording is the way through for a browser with no voice — which is
not hypothetical: the headless Chromium these flows are verified in has none,
so every verification run exercises the fallback rather than the main path.

## Media grew two more parents, and the policies had to follow

A picture can now hang off a question or a word as well as a grammar section.
The old read rule began `section_id IS NULL OR …`, which was harmless while a
section was the only parent a row could have. Once it was not, that branch
would have made every picture on a question or a word readable by every school
on the platform. The restrictive delete rule had the mirror problem: it
required a section, so such a picture could never have been deleted by anyone.

Both were rewritten for three parents, and a `CHECK` constraint now requires
exactly one. Nine isolation tests cover it; four fail against the old policies
and one against the missing constraint.

---

# Phase 6.5 — what a functional review found

Five defects, none of which code review had caught, and all five found by
running the platform and reading what it actually said.

## A unit credited a student for work that did not exist

Measured, not argued: sixteen units, one per combination of parts present,
each read back through the API as the student.

An empty part counted as complete — "nothing left to do" — so every part a
teacher had not prepared handed out a free quarter. A published unit with no
words, no grammar, no activity and no assessment reported **100% and marked
itself complete** for a student who had never opened it. A unit with only an
assessment showed 75% before she answered anything.

An empty part is now worth nothing, and the unit cannot be complete while one
exists. **The consequence is worth stating plainly: a unit missing any of the
four parts can never be finished by a student.** That is deliberate — for the
four themed units, completion has to mean work she did — but it means a unit
without an assessment is permanently incomplete until one is written. The rule
is a setting (`progress.empty_component_counts_as_complete`) so the client can
take the other view without a deploy.

## The course figure counted units that must not count

Welcome and Grammar Review carry `counts_toward_completion = false`, and the
per-unit calculation honoured it — but the teacher's single headline figure per
student averaged every published unit. The flag was right and unread. The
moment a teacher published Welcome, which she will, every student's course
figure would have moved.

## The class view could not load a real class

It opened one transaction per student per unit, all at once. Eighteen published
units was enough to exhaust the connection pool and return a 500; a class of
twenty-five students across six units would have been 150 concurrent
transactions and would never have loaded. Now one transaction per student.

This one is worth remembering as a shape rather than a bug: `Promise.all` over
a per-row helper that opens its own transaction looks harmless at three rows
and fails at twenty.

## Two question kinds could not be authored at all

Matching and word ordering had no entry in the "kind of question" list, and
editing an imported one dropped to a raw JSON box. The engine had marked them
correctly since Phase 4 and the student could answer them since Phase 6 — but a
teacher could not write one without a developer.

The forms are now shaped the way a teacher thinks: matching is a list of rows
("sun goes with day"), ordering is the sentence typed the right way round with
a preview of the shuffled words. The ids the engine needs are built from those
and never shown.

## A student could reach a dead end with nothing to do about it

Two of them, both created by rules that are individually right:

- A word must be heard before it counts, and she may not claim to have heard
  it. On a browser with no voice, a word with no recording cannot be finished.
- A check is never invented, so a unit with fewer than three worded words
  cannot produce one, and its words cannot be finished either.

Both were explained and neither offered a way out. Each now names both routes
forward and carries a button that messages her teacher — naming the exact words
that cannot be played, or the word whose check will not open. "Ask your
teacher" is not much help to an eleven-year-old sitting on her own.
