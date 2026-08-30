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
