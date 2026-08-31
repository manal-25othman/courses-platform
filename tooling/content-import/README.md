# Importing curriculum questions from the Word source

Two scripts. `extract.mjs` reads the document; `restore-missing.mjs` puts back
what the database has lost. Neither invents, corrects or completes anything:
text is taken as written, and anything the file does not state plainly is
flagged for a teacher rather than guessed.

```bash
cd apps/api

# 1. Read the document. Writes nothing; prints JSON.
node ../../tooling/content-import/extract.mjs <file.docx> > questions.json

# 2. First import into an empty course.
DIRECT_URL=… npm run db:import-questions -- questions.json

# 3. Put back only what is missing, after questions have been lost.
DRY=1 DIRECT_URL=… node ../../tooling/content-import/restore-missing.mjs questions.json --unit "Lifestyles"
DIRECT_URL=…     node ../../tooling/content-import/restore-missing.mjs questions.json --unit "Lifestyles"
```

## `source_ref` is the identity

Every extracted question carries a `source_ref` of the form `p<n>`, where `n` is
the paragraph's position in `word/document.xml`. The same file always yields
the same reference for the same question, which is what makes the two scripts
safe to run against a database that already holds some of their output:

- `restore-missing.mjs` inserts a question only if its reference is absent from
  the database **across all units**, so a second run inserts nothing.
- The references are checked repository-wide rather than per unit, because a
  question filed under the wrong unit by an earlier run would otherwise be
  inserted a second time.

It follows that the file must not be edited between runs. Adding a paragraph
shifts every reference below it, and the comparison stops meaning anything.
Check the file's checksum against the one recorded in
`docs/CURRICULUM-FINDINGS.md` before trusting a restore.

## What restoration will not do

- It never updates, reorders or deletes an existing row. It only inserts.
- It refuses the whole run if any missing question names a unit that does not
  exist, rather than filing it under a guess.
- Everything it inserts is a DRAFT, and a question whose answer the extractor
  could not read is marked `needs_review` so it cannot be published as it
  stands.
- `order_index` continues after whatever the unit already holds, so a restored
  question cannot collide with a surviving one.

## Why these run through `../prisma-client.mjs`

Node resolves an ESM import from the importing file's own directory upwards,
not from the working directory. The Prisma client is installed in
`apps/api/node_modules` rather than hoisted to the repository root, so a bare
`import … from '@prisma/client'` inside `tooling/` fails whatever directory the
script is launched from. `tooling/prisma-client.mjs` resolves it against the
API package's manifest, which is what the scripts actually mean: use the same
generated client the API uses.
