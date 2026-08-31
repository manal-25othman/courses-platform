/**
 * Resolves the Prisma client for the maintenance scripts under `tooling/`.
 *
 * A bare `import { PrismaClient } from '@prisma/client'` does not work here.
 * Node resolves an ESM import from the importing *file's* directory upwards,
 * not from the working directory, and the client is installed into
 * `apps/api/node_modules` rather than hoisted to the repository root — so the
 * lookup walks `tooling/` to the root and finds nothing, whatever directory
 * the script was launched from.
 *
 * Resolving against the API package's own manifest is what the scripts
 * actually mean: use the same generated client the API uses.
 */
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));

export const { PrismaClient } = require('@prisma/client');
