/**
 * Makes the six bands the importers file their work into.
 *
 * Every importer here refuses to create a unit — `import-activities.mjs` says
 * so out loud — because inventing curriculum structure is exactly what none of
 * them may do. In development the teacher made these through the CMS, which is
 * the right way and not a way a runner can take. So this creates the same
 * thing the CMS would: a course owned by the school, titled as the application
 * titles it, with the six bands the source document is divided into.
 *
 * Nothing here is authored. The titles and their order come from units.mjs,
 * the same list the extractor has always filed questions against. Welcome and
 * Grammar Review do not count towards a girl's completion — preliminary and
 * revision material, client-confirmed 2026-08-31 — and that is a flag on the
 * row, so a teacher can change it later without a deploy.
 *
 * Everything arrives as a DRAFT, as every import does. Publishing is the
 * teacher's decision and is made from her own screens.
 *
 * Safe to run twice: a course or a unit already there is left alone.
 *
 *   SCHOOL_NAME='…' DIRECT_URL=… node create-course-units.mjs
 *
 * DRY=1 shows what it would create without creating it.
 */
import { PrismaClient } from '../prisma-client.mjs';
import { UNIT_TITLES } from './units.mjs';

const DRY = process.env.DRY === '1';
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const schoolName = process.env.SCHOOL_NAME;

if (!url || !schoolName) {
  console.error('DIRECT_URL and SCHOOL_NAME are both required.');
  process.exit(2);
}

/** Which bands are the course itself, and which are around it. */
const PRELIMINARY = new Set(['Welcome', 'Grammar Review']);

const db = new PrismaClient({ datasourceUrl: url });

async function main() {
  const schools = await db.school.findMany({ where: { name: schoolName } });

  if (schools.length !== 1) {
    console.error(
      `REFUSING: found ${schools.length} schools named "${schoolName}". Expected exactly one.`,
    );
    process.exit(1);
  }

  const [school] = schools;

  // A school works in the course it owns. Asking for "the oldest course" is a
  // different question and has resolved to another school's curriculum before.
  let course = await db.course.findFirst({
    where: { ownerSchoolId: school.id },
    orderBy: { createdAt: 'asc' },
  });

  if (course) {
    console.log(`Course already exists: "${course.title}" (${course.status})`);
  } else if (DRY) {
    console.log('Would create the course "TOP GOAL"');
  } else {
    course = await db.course.create({
      data: {
        title: 'TOP GOAL',
        ownerSchoolId: school.id,
        isSharedMaster: false,
        status: 'DRAFT',
      },
    });
    console.log(`Course created: "${course.title}"`);
  }

  if (!course) {
    console.log('\nDry run: no course, so no units to report against.');
    return;
  }

  const existing = await db.unit.findMany({ where: { courseId: course.id } });
  const byTitle = new Map(existing.map((u) => [u.title, u]));

  let created = 0;

  for (const [index, title] of UNIT_TITLES.entries()) {
    const already = byTitle.get(title);

    if (already) {
      console.log(`  ${index}  "${title}"  already there`);
      continue;
    }

    if (DRY) {
      console.log(`  ${index}  "${title}"  would be created`);
      continue;
    }

    await db.unit.create({
      data: {
        courseId: course.id,
        orderIndex: index,
        title,
        countsTowardCompletion: !PRELIMINARY.has(title),
        status: 'DRAFT',
      },
    });
    created += 1;
    console.log(`  ${index}  "${title}"  created${PRELIMINARY.has(title) ? '  (does not count towards completion)' : ''}`);
  }

  const total = await db.unit.count({ where: { courseId: course.id } });
  console.log(`\n${created} unit(s) created. The course now has ${total}.`);

  if (total !== UNIT_TITLES.length) {
    console.error(`REFUSING to report success: expected ${UNIT_TITLES.length} units, found ${total}.`);
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  })
  .finally(() => db.$disconnect().catch(() => {}));
