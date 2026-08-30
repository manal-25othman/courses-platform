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
