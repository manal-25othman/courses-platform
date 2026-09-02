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

---

# Test data cleanup — and one loss to report

## The Lifestyles import was destroyed during Phase 6 verification

**The eight questions imported into Lifestyles from the supplied source file no
longer exist.** They were removed on 2026-08-31 by a verification script that
cleared the unit before seeding test questions into it:

```js
await db.question.deleteMany({ where: { unitId: unit.id } });   // seed-kinds.js
```

That was written to make a re-runnable fixture and did not distinguish the
fixture's own questions from the curriculum already in the unit. It is a
mistake in the verification tooling, not in the platform.

What is and is not affected:

- The eight were **DRAFT throughout**. No student ever saw them, and no
  attempt, result or frozen snapshot referred to them.
- The other **71 imported questions are intact** — Welcome 8, Living Things 21,
  Interests 21, Professions 14, Grammar Review 7.
- They **cannot be restored from this environment**: the source `.docx` and the
  extracted JSON are not in the repository, and the container that held the
  uploaded file has since been rebuilt. Recovering them means re-supplying the
  source file and re-running `prisma/import-questions.ts`.

The lesson is narrow and worth keeping: a fixture script must delete **its own
rows by id**, never everything under a parent it does not own. The cleanup
scripts in `tooling/db-cleanup/` are written that way deliberately, and they
refuse to classify a record as test data on one signal alone.

## The source-rights hold had been broken by testing

Confirmed decision §51 holds that nothing from the supplied source file reaches
a student until the client confirms she holds the right to distribute it. Phase
6 verification published Living Things so the browser suites had something to
run against, and publishing a unit publishes its questions — so 21 imported
questions sat PUBLISHED for the length of that work.

Nothing reached a real student: the only account that could have seen them was
the development student, and the material was never in front of anyone outside
this environment. The hold is now restored — every unit and every imported
question is DRAFT — and `restore-rights-hold.mjs` exists so the same thing
after a future test run is one command to undo.

This is the second time a verification convenience has quietly changed
curriculum state. Both times the platform behaved exactly as designed; it was
the test scaffolding that overreached.

---

# Re-inspection of the source, 2026-08-31

The client supplied the source file again and asked two things of it: put back
the eight Lifestyles questions that Phase 6 verification destroyed, and say
exactly what the file contains before any of it is entered in bulk.

The three uploaded copies are byte-identical to each other and to the copy the
original import ran against (`md5 176ad3f307072d4ca28fb9d77a617c67`). That
matters more than it sounds: it means the committed extractor is still reading
the same document that produced the seventy-one questions now in the database,
so the two can be compared record for record rather than judged by eye.

## The eight Lifestyles questions are real, and there are exactly eight

`tooling/content-import/extract.mjs` was re-run unchanged. It yields 79
questions. Seventy-one of them match rows already in the database on every
field — type, prompt, payload, answer key and unit — and the eight that do not
are all Lifestyles:

| `source_ref` | Kind | Question |
|---|---|---|
| p633 | complete_sentence | 1) I have 10 …….. on my feet. |
| p635 | complete_sentence | 2) If you are sick, you need to take some ……..…….. . |
| p637 | complete_sentence | 3) I use ……….. to keep myself clean. |
| p639 | complete_sentence | 4) My …….. is in the middle of my arm. |
| p808 | odd_one_out | knife – soap – fork – dish |
| p809 | odd_one_out | medicine – finger – toe – knee |
| p810 | odd_one_out | helpful – write – wait – fall |
| p811 | odd_one_out | sugar – jam – salt – eggs |

The count was not aimed at. Eight is what the file yields, and it agrees with
the eight the cleanup audit recorded as lost.

`source_ref` is what made the restoration safe. The extractor derives it from
the paragraph's position in the document, so the same file always names the
same question the same way, and a reference already held in the database means
that question is already there. `restore-missing.mjs` inserts only references
the database does not hold, which is why running it twice inserts nothing the
second time.

Every answer key was read from the file's own yellow highlighting; none was
guessed, and none of the eight needed a teacher. All eight are DRAFT, and the
Lifestyles unit stays unpublished.

## The client was right about the vocabulary, and the earlier finding was wrong

The earlier conclusion — that the source carries no vocabulary list — is
withdrawn. It was wrong, and it was wrong for a reason worth writing down: the
vocabulary is in **tables**, and the extraction that produced that conclusion
read the document as a stream of paragraph text. A table's rows survive that
reading; the fact that they were a table, and which cell sat beside which, does
not.

Each unit opens with a two-language table laid out `Arabic | English | Arabic |
English`, so every English word carries its Arabic meaning explicitly, in the
file, written by the author. Nothing here is translated by us.

| Unit | Word pairs | Arabic meaning present | Notes |
|---|---|---|---|
| Welcome | 18 | 16 explicit | `hundred` and `thousand` are glossed `100` and `1000` — digits, not Arabic words. Flagged for the teacher |
| Living Things | 26 | all 26 | — |
| Lifestyles | 36 | all 36 | Largest list in the file |
| Interests | 26 | all 26 | — |
| Professions | 26 | all 26 | Includes multi-word terms: `AI specialist`, `artificial intelligence`, `cybersecurity analyst`, `video message` |
| Grammar Review | 0 | — | No vocabulary table; it is a grammar section |

**132 word pairs across the five units**, 130 with an explicit Arabic meaning.

No vocabulary table carries a picture, and the file contains no audio of any
kind — no embedded media beyond images, and no pronunciation recordings. Word
pictures and teacher recordings therefore remain something the platform
supplies, not something the source does. Some unit exercises *do* pair pictures
with these same words (see below), and those pictures are the natural source of
word images later.

## Grammar Review is eight full-page scans and no text at all

This is the part plain-text extraction misses completely, and the part worth
being explicit about.

Grammar Review holds no extractable prose. It is eight page images,
1024×1536 each, and everything in them — the explanations, the rules, the
examples, the exercises and the answers — is picture, not text. Read as text
the section looks empty. It is the densest teaching material in the file.

Each sheet is a designed grammar page carrying: an English and Arabic title, a
definition in both languages, the rule as a formula, worked example tables,
Arabic translations of the examples, a "common mistakes" ✗/✓ panel, a mind map,
a quick-summary box, and **practice exercises, several of which print their own
answer key**.

| Image | Topic | Belongs to |
|---|---|---|
| image73.png | Passive voice, present simple (المبني للمجهول في المضارع البسيط) | Living Things |
| image74.png | Where clauses | Living Things |
| image75.png | Conditional sentences, zero and first (الجمل الشرطية) | Lifestyles |
| image76.png | Countable & uncountable nouns, a few / a little | Lifestyles |
| image77.png | Present perfect (المضارع التام) | Interests |
| image78.png | Present perfect keywords — ever, never, just, already, yet | Interests |
| image79.png | Simple past & past progressive (الماضي البسيط والماضي المستمر) | Professions |
| image80.png | Restrictive relative clauses — who, which, that | Professions |

**The unit mapping above is read from the content, and it disagrees with the
document's own headings.** The file groups the images under headings
`Unit 1:` (1 image), `Unit 2:` (3), `Unit 3:` (2), `Unit 4:` (2). Every one of
these images is a *floating anchor*, as are the headings themselves, so the
order they appear in the file is not the order they appear on the page and the
grouping cannot be trusted. The content settles it: image74's worked examples
are "The jungle is where tigers hunt" and "The trees are where monkeys play",
which are word for word the Living Things grammar exercise, not a Lifestyles
one. Each unit's two sheets then match that unit's own grammar questions
exactly. **A teacher should confirm the pairing visually before entry** — it is
a minute's work against the printed pages and it is the one place in this
inventory where the file contradicts itself.

These pages are also the answer to the client's preference for video: they are
already a complete taught explanation. A video, where one exists, supplements
them rather than replacing them.

## What each core unit holds

Every core unit follows the same nine-part shape, so the inventory is the same
shape four times over. Counts are items, not exercises.

| | Living Things | Lifestyles | Interests | Professions |
|---|---|---|---|---|
| Vocabulary pairs | 26 | 36 | 26 | 26 |
| Match the correct answer (5 stems ↔ 5 answers) | 1 table | 1 table | 1 table | 1 table |
| Short answer, answers written in the file | 2 | 2 | 2 | 2 |
| Choose and complete the sentence | 4 | 4 | 4 | 4 |
| Order the words to make sentences | 3 | 3 | 3 | 3 |
| Circle ✓ or × against a picture | 4 | 4 | 5 | 5 |
| Grammar multiple choice | 6 | 6 | 6 | 6 |
| Do as shown in brackets | 2 | 2 | 3 | 3 |
| Missing letter | 5 | 5 | 5 | 5 |
| Odd one out | 4 | 4 | 4 | 4 |
| Picture ↔ word (matching / spelling / naming) | 6 | 6 | 6 | 6 |
| Free writing, with a model answer | 1 | 1 | 1 | 1 |
| Reading passage + questions | 4 MC + 3 T/F | 6 T/F | 4 MC + 3 T/F | 4 MC + 3 T/F |
| Grammar sheets (scans) | 2 | 2 | 2 | 2 |
| Images | 15 | 17 | 14 | 11 |

Welcome, which is reference material and not a completion unit, holds 18
vocabulary pairs, one matching table, 8 complete-the-sentence questions, 5
picture true/false, one 6-item picture matching, and 11 images.

**80 images in total**: 4 front matter, 11 Welcome, 15 Living Things, 17
Lifestyles, 14 Interests, 11 Professions, 8 Grammar Review. (The archive holds
92 media files; 12 are `.wdp` sidecars Word writes beside images with effects
applied, not separate pictures.)

Every one of these exercise kinds maps onto a question type the engine already
has. Nothing in the file needs a type that does not exist.

## What is already imported, and what is not

Of the source's exercises, 79 questions are in the database. The rest are not,
and the reason is consistent: the extractor imports a question only where the
file makes both the question *and* its answer readable as text.

| Kind | In the database | Why the rest are not |
|---|---|---|
| Choose and complete | 24 | — |
| Grammar / reading multiple choice | 30 | — |
| Odd one out | 16 | — |
| True / false with `( T )` / `( F )` | 9 | — |
| Match the correct answer | 0 | The pairing is table geometry; flattened text loses which stem went with which answer |
| Order the words | 0 | The scrambled words and the model answer are separate lines with nothing linking them |
| Picture matching / spelling / naming | 0 | The association is between a picture and a cell; there is no text that states it |
| Circle ✓ or × | 0 | **The file never marks which is correct** |
| Missing letter | 0 | Laid out as a table of stems above a table of letter choices |
| Do as shown in brackets | 0 | The transformation is a free-text answer |
| Free writing | 0 | Not automatically markable, by its nature |

The extractor recorded 256 such refusals rather than guessing at any of them.
That is the correct behaviour and it is why the remaining entry is teacher work
rather than a bigger script.

Two things need a person specifically:

- **The "Circle ✓ or ×" exercises carry no answer anywhere in the file** — 18
  items across the four core units (4 + 4 + 5 + 5), and 5 more in Welcome. A
  teacher must supply every answer; they cannot be inferred from the picture.
- **The Lifestyles grammar block has no highlighting at all**, so its 6
  multiple-choice answers are unmarked where the other units' are marked. A
  teacher must supply those 6.

Three previously imported questions still await a teacher, unchanged from
before: `p104` (Welcome), `p1140` and `p1168` (Interests), where the
highlighting covered a word fragment that matches no option.

## Seven questions are filed under the wrong unit

The seven questions currently in **Grammar Review** are not grammar review
material. They are the reading-passage questions from the end of
**Professions** — the passage about teachers' previous jobs, asking what Mr.
Jackson and Ms. Bryans did before teaching.

They landed there because `unitAt()` attributes a question to the last unit
heading above it in the file, and "Grammar Review" is a floating page-header
text box that appears, in document order, before the last page of Professions.
The same floating-anchor problem that scrambles the grammar images.

This was **not** corrected. The instruction for this task was to leave the
existing imported questions alone unless a change was needed to prevent
duplication, and this is not that. It is recorded here so the full content
entry can move them, and so the Professions and Grammar Review counts are read
with it in mind: Professions really holds 21 imported questions and Grammar
Review really holds none.

## The sequential unlock flow does not exist yet

The client confirmed Vocabulary → Grammar → Assessment, with grammar locked
until vocabulary is done and the assessment locked until both are. **None of
that is implemented, on either side.**

- `AssessmentState.blockedBecause` in `apps/api/src/learning/learning.types.ts`
  admits exactly three reasons: `no_questions`, `no_attempts_left` and
  `already_passed`. Incomplete vocabulary or grammar is not among them, and
  `learning.service.ts` never consults either when deciding `canStart`.
- The student's unit page (`apps/web/src/app/learn/[unitId]/page.tsx`) renders
  four tabs whose handlers are plain `setTab` calls. No tab is ever disabled,
  and nothing checks progress before switching.

So today a student may open any of the four sections in any order and sit the
assessment having done nothing else. Nothing here is *wrong* against what was
built — the gating was simply never a requirement until now.

The smallest correction, for the implementation task that owns it:

1. Extend `blockedBecause` with `vocabulary_incomplete` and
   `grammar_incomplete`, and compute them in `assessmentState` from the
   progress figures `progressWithin` already produces. The server stays the
   authority; `startActivity` must refuse an assessment start for the same
   reasons, exactly as it already refuses `already_passed`.
2. Return a matching lock state for the grammar section, from the vocabulary
   component's own progress.
3. Have the tabs read that state and disable what is locked, saying why.

The progress weighting does not change: 25/25/25/25 stands, Activity is still
required for 100%, and gating the assessment on vocabulary and grammar leaves
the formula untouched. Bonus Games must not appear in any of these conditions.

## Two recommendations the client asked for

### Optional grammar video: a URL on the section, and no new dependency

The grammar section model already carries typed content and an optional
uploaded image. The smallest honest addition is **one nullable `videoUrl`
column on the grammar section**, entered by the teacher in the CMS and rendered
as an embed when present.

No video hosting should be bought or added. The client's material is eight
scans and whatever she records herself; the realistic destination is YouTube
(unlisted) or Google Drive, both free, both already how a teacher shares a
video. A paid host would be a recurring cost for a feature that is optional by
the client's own description.

Two things this must do to stay safe, because a URL field that renders markup
is an injection hole:

- **Store the URL, never an embed snippet.** Accept a URL, parse it, and build
  the iframe ourselves. Never render teacher-supplied HTML.
- **Allow-list the hosts** in the settings store, the same way every other
  policy in this system is configured — so the list is changed by
  configuration, not by a release, and an unrecognised host is refused at entry
  with a message rather than silently embedded.

That is one nullable column, one settings key, one small parser and one player
component. It carries no new package and no monthly bill.

### Bonus games: one attempt-free runner over the content that already exists

The games the client named — memory match, word ↔ meaning, word ↔ image,
sorting, quick vocabulary challenges, grammar review games — are all the same
shape: *pair or group things drawn from a unit's existing content, against a
clock or a score that is never recorded.*

So the recommendation is to build **no new content and no new question rows**.
A bonus game should read what is already there:

- word ↔ meaning and memory match read `VocabularyItem.wordEn` / `wordAr` —
  132 pairs are already in the source, which is more than enough;
- word ↔ image reads the word's picture once those are attached;
- sorting and classification reuse the odd-one-out groups already imported (16
  of them), whose members are by construction a category plus an outsider;
- grammar review games reuse the Grammar Review sheets' own practice items once
  those are entered.

The framework needed is small: a `BonusGame` definition naming a unit, a game
kind and which content pool it draws from, and a client-side runner per kind.
What matters is what it must *not* have, and this should be enforced rather
than documented:

- **no `ActivityAttempt` row, ever** — that table is what feeds progress,
  scoring and the assessment attempt count, and a bonus game that writes to it
  would silently consume one of the student's two assessment attempts;
- no contribution to any progress component;
- a clearly separate place in the interface, so a student can tell at a glance
  that a game does not count.

The existing `randomize` helpers (`createRng`, `shuffle`) already give each
round a fresh order, and the settings store already gives per-unit
configuration. Neither needs extending.

## Recommended scope for the full content entry task

In order, because each step depends on the one before it:

1. **Move the seven mis-filed questions** from Grammar Review to Professions,
   and correct `unitAt()` so a floating heading cannot mis-file again.
2. **Enter the 132 vocabulary pairs** from the five bilingual tables, by unit,
   English and Arabic exactly as written. This is mechanical and scriptable
   from the tables; it should not be typed by hand.
3. **Attach the 8 grammar sheets** as grammar section images, two per core
   unit, after a teacher has confirmed the pairing. Add the optional video URL
   field in the same pass if the client wants it then.
4. **Enter the exercises the extractor refused** — matching, ordering, picture
   matching, missing letter, spelling — as structured questions through the
   CMS, which already supports every one of these kinds.
5. **Collect the missing answers**: 18 "Circle ✓ or ×" items, the 6 Lifestyles
   grammar answers, and the 3 still-flagged imports. These need the teacher and
   nothing else will do.
6. **Split activity from assessment** per unit, and set the assessment pools.
   No assessment exists in the source as such — the file is a revision
   worksheet throughout, with no section marked as a test — so which questions
   become the assessment is the teacher's decision, not the document's.
7. Only then, the sequential unlock flow and the bonus game framework.

Nothing in steps 1–6 may be published while the source-rights hold stands.

---

# Full content entry, 2026-08-31

The inventory was approved and the content it described has been entered. What
follows is what actually went in, what did not, and why.

Everything below is DRAFT. The source-rights hold stands: no unit, question,
word or grammar section is published, and nothing here is visible to a student.

## The seven mis-filed questions are back where they belong

`unitAt()` used to attribute a question to the last unit heading above it in
the file. Every unit heading in this document is a floating text box, and a
floating shape's position in the XML is not its position on the page — so the
Grammar Review header, stored before the page it heads, captured the last seven
Professions questions.

The fix stops ordering against headings at all. Each unit opens with a
bilingual vocabulary table, which is ordinary inline body content and therefore
*is* where it appears; those tables now mark the unit boundaries, and the
floating headings only supply the name of the band nearest each one. Re-running
the extractor moved exactly seven questions and changed nothing else — 72 of 79
byte-identical, no content edits, no questions gained or lost.

A unit that has a heading but no vocabulary table can no longer be attributed
anything, and says so: the extractor now emits a flag naming Grammar Review
explicitly, so a later edition that adds questions there cannot have them
silently filed under Professions.

`tooling/content-import/extract.spec.ts` guards this with a miniature document
that reproduces the trap. Reverting `unitAt()` to the old logic fails it.

Professions now holds 21 questions and Grammar Review none.

## Vocabulary: 132 pairs, exactly as the source writes them

| Unit | Pairs | Needing a teacher |
|---|---|---|
| Welcome | 18 | 2 |
| Living Things | 26 | 0 |
| Lifestyles | 36 | 0 |
| Interests | 26 | 0 |
| Professions | 26 | 0 |

Nothing was translated, inferred or rewritten. The two flagged entries are
`hundred` and `thousand`, whose meanings the source gives as `100` and `1000` —
digits, not Arabic. They are stored exactly as written and marked for review,
because changing them would be inventing a meaning and dropping them would be
losing curriculum.

One extraction bug is worth recording because it is the same one that produced
the original wrong finding about this file. `<w:t[^>]*>` also matches `<w:tbl>`,
`<w:tc>` and `<w:tr>`, and the lazy capture after it then swallows markup as if
it were text. The first extractor survives this only because it strips tags
afterwards. Requiring `<w:t>` or `<w:t ` is what makes a table readable.

## Grammar: eight scans, prepared and flagged

The eight teaching sheets are attached as grammar sections, two per core unit,
re-encoded to about 500 KB each so they sit under the platform's 2 MB picture
limit and a teacher can replace one through the normal upload screen.
Resolution is unchanged and the text is fully legible.

**All eight are marked "needs your check".** The mapping follows each sheet's
own worked examples, because the document's headings group them 1/3/2/2 and
contradict the content; every image is a floating anchor, so the file's order
is not the page's. The manifest at `tooling/content-import/grammar-scans.json`
records the evidence for each pairing. A teacher confirms them against the
printed pages before anything is published.

No teaching text was written, summarised or generated. The `body` of each
section is deliberately empty: the teaching content is the sheet.

## Optional grammar video

A grammar section can now carry a video address. The design is the one the
inventory recommended, and its safety rests on two rules:

- **Only an address is ever stored, and the player is built from its parts in
  the API.** Nothing a teacher types is rendered as markup. Paste an
  `<iframe>` into the field and it is refused as not being a web address.
- **The allowed hosts are a setting** (`grammar.video_allowed_hosts`,
  seeded with YouTube and Google Drive), so the client can add one without a
  release, and an address anywhere else is refused when she saves it rather
  than becoming an empty frame on a student's screen.

`javascript:` and `data:` addresses are refused before host matching. Host
matching is equality, not a suffix test — `notyoutube.com` does not pass. The
player iframe is sandboxed.

No video hosting is bought or added; there is no new dependency and no bill.

`src/content/video.spec.ts` covers all of this. The lookalike-host test is
written to require the allow-list's own wording, because a host check written
with `endsWith` still refuses that address further down, where no provider
claims it — asserting only "it throws" passed against the very bug it guards.

## Activities: 69 more questions

Everything the first extractor refused, wherever the source states the answer.

| Kind | Entered | Where the answer comes from |
|---|---|---|
| Matching | 5 | The middle column numbers each answer to its stem |
| Spelling | 18 | The answer word is printed under the picture |
| Missing letter | 20 | Derived — see below |
| Word ordering | 10 | The finished sentence is written under the scrambled words |
| Picture matching | 6 | Each picture carries the number of the word it shows |
| Word for a picture | 6 | The answer word is printed under the picture |
| Grammar transformation | 4 | The corrected sentence is written under the task |

All 69 were checked against the real question engine — the same validators the
API runs when a teacher saves a question — before any of them was written.

**Missing letter is the one derived answer, and it is derived from the source,
not from us.** The file gives three letter choices and never marks which is
right. A choice is accepted only where it is the only one that completes the
word into a word this document's own vocabulary defines. Where none fits or
more than one does, the question is entered with no answer and marked for a
teacher: 17 of 20 resolved, 3 did not.

Two defects were found by checking rather than by reading, and both are fixed:

- The scrambled-letters row was being found by content ("a row with letters and
  no pictures"), which matched the instruction row at the top of the table. 17
  of 18 spelling questions lost their clue. Rows are now identified by position
  relative to the pictures, with the widths required to agree.
- Word ordering matched one answer word against one token, so every sentence
  built from a phrase ("a musician", "the wild", "the missing boy") failed. The
  answer is now consumed a token at a time, longest first.

## What a teacher still has to answer

Six items, and no more:

| Where | What | Why |
|---|---|---|
| Welcome | `hundred` = `100` | The source gives digits, not Arabic |
| Welcome | `thousand` = `1000` | The source gives digits, not Arabic |
| Welcome | `p104` | The highlighting covers a word fragment |
| Interests | `p1140` | The highlighting covers a word fragment |
| Interests | `p1168` | The highlighting covers a word fragment |
| Lifestyles | `_lives` (e/i/o) | No choice completes a word the document defines |
| Professions | `_fficer` (o/i/a) | No choice completes a word the document defines |

Plus the eight grammar scans, whose unit pairing needs visual confirmation.

**The 18 "Circle ✓ or ×" items were not entered at all.** The source marks no
answer for any of them, so entering them would mean either guessing eighteen
answers or creating eighteen empty questions. They are left for the teacher to
enter with their answers, and are listed in the next-steps section below.

One Lifestyles ordering exercise is flagged because the source itself is
inconsistent: its scrambled list contains "broken" twice and a stray "watch"
that the answer does not use.

## Sequential unlock

Vocabulary → Grammar → Assessment, enforced on the server and reflected in the
screen. The rule the implementation turns on:

> A gate only bites where there is something to gate on.

A component with nothing published in it counts as satisfied. Without that, a
unit whose vocabulary the teacher has not written yet would lock its grammar
and its assessment forever — a dead end rather than a sequence.

- `AssessmentState.blockedBecause` gained `vocabulary_incomplete` and
  `grammar_incomplete`, after the three reasons a student cannot change.
- `startActivity` refuses an assessment for either reason, and
  `markSectionViewed` — the call that records grammar as read — refuses while
  vocabulary is unfinished. That second one is what stops a student reaching
  grammar by typing an address.
- The student's tabs are disabled and say what to do next, and a locked tab can
  never be the open one.

The weighting is untouched: 25/25/25/25, Activity is not a gate but is still
required for 100%, and bonus games are in none of these conditions.

Whether the sequence applies at all is a setting (`learning.sequential_unlock`),
so it is the client's to change without a release.

## Bonus games

Two games, Memory Match and Quick Match, both drawing rounds from vocabulary
already stored. No new curriculum content and no duplicate copy of any.

The guarantee that they count for nothing is structural rather than promised:
`GamesService` has no write path at all. It reads vocabulary and returns a
round. There is no attempt row it could create by mistake, which also means a
game cannot spend one of the two assessment tries.

Wrong answers in Quick Match are always other real meanings from the same unit.
The distractor pool is made unique before three are taken from it — two words in
this curriculum can share a meaning, and offering the right answer twice makes
a question unanswerable. That was found by a test, not by reading.

Which games exist is a registry table, so a third is a row and a view rather
than a change to how games are listed.

## What was verified, and how

The unlock rules were checked twice over: through the raw HTTP API with no
browser involved, and in a real browser on a phone-sized screen with taps
rather than clicks. Seventeen API checks and ten browser checks, all passing.
Both ran against an isolated fixture in its own school — the only published
rows in the database while they ran — which was removed afterwards, leaving no
attempts, no progress and no extra school behind.

Mutation testing was used on the rules where being wrong would be expensive:
treating an empty component as incomplete (the dead end), removing the server's
refusal to start a blocked assessment, and weakening the video host check to a
suffix test. All three were caught.

---

# The teacher's decisions, 2026-09-02

All thirty-four open questions came back answered. What follows is what was
applied, what the answers changed, and the one thing worth flagging back.

Everything remains DRAFT. Curriculum approval is not permission to publish: the
source-rights hold on the compiled Word file is untouched.

## A discrepancy in the decision list, resolved from the source

The eighteen tick-or-cross answers arrived under three headings — LIVING
THINGS covering items 1–8, then INTERESTS and PROFESSIONS — with no LIFESTYLES
heading at all. The source disagrees: items 5–8 (*That is my finger*, *You
should take some medicine*, *My arm is broken*, *We use it to cut things*) sit
in the Lifestyles unit, and Living Things has only four.

The numbering and the wording match the review pack item for item, so the
headings are a transcription slip rather than a re-assignment — and the
instructions were explicit that unit assignments are to be preserved. The
answers were therefore matched by question text, which is unique, and each
question filed under the unit the source puts it in. Nothing was moved.

## What was applied

| | Count |
|---|---|
| Grammar sheet pairings confirmed | 8 |
| Tick-or-cross questions created with their answers | 18 |
| Vocabulary entries confirmed as written | 2 |
| Answers supplied where the source stated none | 4 |
| Source corrections she approved | 2 |
| **Total** | **34** |

Running the script a second time applies nothing and reports all thirty-four as
already done.

### The pictures were left exactly as the source has them

Two anomalies were reported before entry and both survive untouched. *I like
collecting coins.* has **two** pictures in the source and still has two; *She
won a prize.* has **none** and still has none. Neither was tidied up: inventing
a picture and deleting a real one are the same kind of mistake.

### The two source corrections

These are the only places where what is stored differs from what the file says,
and both carry her approval and the reason on the record itself.

- **Interests, odd one out.** The file reads `correction – education –
  reaction- invite`; the missing space made it read as three options. It is now
  four, with *invite* as the answer.
- **Lifestyles, word ordering.** The file's word list holds *broken* twice and
  an extraneous *watch*. The duplicate and the extra word are removed, leaving
  eight words that build the sentence the file itself prints.

Nothing else in the curriculum was touched.

## The assessment: an architecture conflict, and the smallest fix

**The conflict was real.** `questions.purpose` is exclusive — a question is
either an activity question or an assessment question, never both — and an
attempt used the entire assessment pool with no sampling. Under that model the
only way to give a unit a ten-question assessment was to move ten questions out
of its activity, forty across the four units, and a student would then never
meet those ten in practice.

Rather than make `purpose` non-exclusive — which would change what "activity"
means for progress, for the CMS and for every attempt already recorded — only
*where the assessment looks* changed:

> A teacher may curate a pool by moving questions into the assessment. Where
> she has, that pool is the assessment and nothing else is used. Where she has
> not, the assessment draws from the unit's own approved activity questions.

An attempt then asks `assessment.question_count` questions, taken off the front
of the engine's seeded shuffle. Curation still works exactly as before, no
question was moved, no snapshot changed, and no unit needed a selection stage.

What the pool refuses is as important as what it offers: a question from
another unit, one that is unpublished, and one still waiting on a teacher's
answer are all excluded by the query itself.

| Unit | Approved questions | Attempt asks | Ten possible |
|---|---|---|---|
| Living Things | 41 | 10 | yes |
| Lifestyles | 29 | 10 | yes |
| Interests | 41 | 10 | yes |
| Professions | 40 | 10 | yes |

One existing test had to change. It asserted that a unit with activity
questions but no curated assessment reports its assessment component as
*empty*. That is no longer true, and it is no longer supposed to be: such a
unit now has an assessment. The test was updated to the new rule and a second
one added for the case it used to cover — a unit with no questions at all,
where the assessment genuinely is missing and is named as such. The weighting
is unaffected either way: an empty component and an unpassed one both score
zero, so 25/25/25/25 and every overall figure are unchanged.

## How it was verified

Thirty-three checks over the real HTTP API, against an isolated fixture in its
own school with two units — twelve settled questions each plus one deliberately
left unanswered:

- the sequence still holds, and the assessment is refused over HTTP before it;
- an attempt asks exactly ten, none twice, none from the other unit, and never
  the unanswered one;
- seven right out of ten scores 70 and does not pass; ten out of ten scores 100
  and does;
- the second attempt is allowed, the third refused, and the highest score is
  the one kept;
- the activity stays its own quarter throughout — untouched by the assessment,
  still zero, and the unit is not complete without it.

Three mutations were used to check the tests bite: dropping the `needsReview`
filter from the pool, ignoring a curated pool, and removing the ten-question
slice. All three were caught.

The fixture was removed afterwards, leaving no attempts, no progress and no
extra school.
