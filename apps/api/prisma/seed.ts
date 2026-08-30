/**
 * Seeds the confirmed configuration values.
 *
 * Every value here comes from a decision recorded in docs/SRS.md and
 * docs/ARCHITECTURE.md. They live in the database, not in the code, so they can
 * be changed later without a rebuild. Nothing here is invented.
 *
 * Safe to run more than once: existing values are left untouched, so a value an
 * administrator has changed is never silently reset back to the default.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient, SettingScope } from '@prisma/client';

const prisma = new PrismaClient();

/** key -> value, with the SRS reference that confirmed it. */
const GLOBAL_SETTINGS: Array<{ key: string; value: unknown; source: string }> = [
  // --- Assessment (SRS 17, 18, 19, 47) ---
  { key: 'assessment.passing_score', value: 80, source: 'SRS 17' },
  { key: 'assessment.max_attempts', value: 2, source: 'SRS 18' },
  { key: 'assessment.result_policy', value: 'highest', source: 'SRS 19' },

  // --- Activities (SRS 9) ---
  // null = unlimited retries. The 2-attempt cap applies to assessments only.
  { key: 'activity.max_attempts', value: null, source: 'SRS 9' },

  // --- Progress weighting (SRS 21) — equal quarters ---
  {
    key: 'progress.weights',
    value: { vocabulary: 25, grammar: 25, activity: 25, assessment: 25 },
    source: 'SRS 21',
  },

  // --- Vocabulary completion (SRS 22) ---
  // A word counts as learned once it has been seen AND its audio played.
  { key: 'vocabulary.completion_rule', value: 'seen_and_audio_played', source: 'SRS 22' },

  // --- Audio (SRS 7) ---
  { key: 'audio.provider', value: 'browser', source: 'SRS 7' },

  // --- Randomization (SRS 11, 55) ---
  { key: 'randomization.shuffle_questions', value: true, source: 'SRS 11' },
  { key: 'randomization.shuffle_options', value: true, source: 'SRS 11' },
  { key: 'randomization.matching_shuffle_both_columns', value: true, source: 'SRS 55' },

  // --- Games (SRS 13.1) — motivation only, no effect on outcomes ---
  { key: 'games.affects_completion', value: false, source: 'SRS 13.1' },
  { key: 'games.affects_score', value: false, source: 'SRS 13.1' },
  { key: 'games.affects_progress', value: false, source: 'SRS 13.1' },

  // --- Interface (SRS 39) — English for all roles ---
  { key: 'ui.language', value: 'en', source: 'SRS 39' },
];

async function main(): Promise<void> {
  console.log('Seeding confirmed configuration values...\n');

  let created = 0;
  let kept = 0;

  for (const { key, value, source } of GLOBAL_SETTINGS) {
    // Note: `upsert` is deliberately not used here. The unique constraint
    // includes `scopeId`, which is NULL for global settings, and PostgreSQL
    // treats NULLs as distinct — so an upsert keyed on it would insert
    // duplicates. Look the row up explicitly instead.
    const existing = await prisma.setting.findFirst({
      where: { scope: SettingScope.GLOBAL, scopeId: null, key },
    });

    if (existing) {
      kept += 1;
      console.log(`  = ${key} (already set, left unchanged)`);
      continue;
    }

    await prisma.setting.create({
      data: {
        scope: SettingScope.GLOBAL,
        scopeId: null,
        key,
        value: value as never,
      },
    });
    created += 1;
    console.log(`  + ${key} = ${JSON.stringify(value)}   (${source})`);
  }

  console.log(`\nDone. ${created} created, ${kept} already present.`);
}

main()
  .catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
