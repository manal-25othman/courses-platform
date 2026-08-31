# Importing curriculum from the Word source

Four extractors and four importers. None of them invents, corrects or completes
anything: text is taken as written, an answer is used only where the source
states it, and anything ambiguous is flagged for a teacher rather than guessed.

```bash
cd apps/api
SRC=/path/to/Top_Goal_3_Term_1_answers.docx

# 1. Questions the file states in plain text, with the answer highlighted.
node ../../tooling/content-import/extract.mjs "$SRC" > questions.json
DIRECT_URL=… npm run db:import-questions -- questions.json

# 2. Put back questions the database has lost, without duplicating the rest.
DIRECT_URL=… node ../../tooling/content-import/restore-missing.mjs questions.json

# 3. Move questions the extractor once filed under the wrong unit.
DIRECT_URL=… node ../../tooling/content-import/refile-questions.mjs questions.json

# 4. The bilingual vocabulary tables.
node ../../tooling/content-import/extract-vocabulary.mjs "$SRC" > vocabulary.json
DIRECT_URL=… node ../../tooling/content-import/import-vocabulary.mjs vocabulary.json

# 5. The exercises whose structure is the table they sit in.
node ../../tooling/content-import/extract-activities.mjs "$SRC" > activities.json
npx ts-node prisma/validate-extracted.ts activities.json      # against the real engine
DIRECT_URL=… node ../../tooling/content-import/import-activities.mjs activities.json "$SRC"

# 6. The grammar teaching scans. Needs python3 with Pillow.
DIRECT_URL=… node ../../tooling/content-import/import-grammar-scans.mjs "$SRC"
```

Every importer takes `DRY=1` to show what it would write without writing it,
and every one is safe to run twice: a second run writes nothing.

## Two things make this safe to re-run

**`source_ref` is the identity.** Each extracted question carries `p<n>`, from
the paragraph's position in `word/document.xml`. The same file always yields
the same reference for the same question, so an importer can tell what it has
already written. It follows that **the file must not be edited between runs** —
adding a paragraph shifts every reference below it. Check the file's checksum
against the one in `grammar-scans.json` before trusting a restore.

**Vocabulary is identified by `(unit, word)`**, which the database holds unique.
A word already present is left alone rather than overwritten, so a teacher's
correction is never undone by a later import.

## Why headings are not used for ordering

Every unit heading in the supplied file lives in a floating text box, and a
floating shape's position in the XML is not its position on the page: Word
stores it against an anchor paragraph and draws it wherever the layout puts it.
Filing questions by "the last heading above them" therefore put the last seven
Professions questions under Grammar Review.

The bilingual vocabulary table that opens each unit is ordinary inline body
content, so its position *is* its position. Those tables mark the bands; the
headings only name the band nearest each one. A unit with no such landmark —
Grammar Review has none — can be attributed nothing, and the extractor says so
in its flags rather than letting a future edition be mis-filed silently.

`extract.spec.ts` guards this with a miniature document that reproduces the
trap, and runs in the ordinary test suite.

## The regex that eats tables

`<w:t[^>]*>` also matches `<w:tbl>`, `<w:tc>`, `<w:tr>` and `<w:tabs>`, and the
lazy capture that follows swallows everything up to the first real `</w:t>` —
markup, not words. `extract.mjs` survives this only because it strips tags
from the joined text afterwards. Anything that reads a table needs
`<w:t(?:\s[^>]*)?>`, or the cells come back full of XML. This is what made the
vocabulary look absent on the first pass.

## Why these run through `../prisma-client.mjs`

Node resolves an ESM import from the importing file's own directory upwards,
not from the working directory, and the Prisma client is installed in
`apps/api/node_modules` rather than hoisted to the repository root. A bare
`import … from '@prisma/client'` inside `tooling/` therefore fails whatever
directory the script is launched from.
