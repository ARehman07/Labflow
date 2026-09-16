#!/usr/bin/env node
/**
 * Type-check against the client the server will actually run.
 *
 * Local development runs on SQLite, whose generated client has no enums —
 * every status is a plain string. Postgres's client has real enum types, so a
 * `where` that reads `status: { not: 'CANCELLED' }` type-checks locally and is
 * rejected on the server. Worse, a rejected `where` makes Prisma fall back to
 * the default payload for the whole query: `select` is ignored, and the build
 * fails somewhere else entirely — in whatever maps the rows. That is exactly
 * how a deploy broke once, on a build that was green here.
 *
 * So: generate the Postgres client, run tsc, and put the SQLite client back
 * whatever happens. Run it before pushing, or let CI run it.
 */
import { spawnSync } from 'node:child_process';

const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: false });

const step = (label, cmd, args) => {
  console.log(`\n▸ ${label}`);
  const res = run(cmd, args);
  return res.status ?? 1;
};

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

let code = step('prisma generate (postgres)', npx, ['prisma', 'generate']);
if (code === 0) code = step('tsc --noEmit', npx, ['tsc', '--noEmit']);

// Always restore, so the next `npm run dev` talks to SQLite as before.
const restored = step('prisma generate (sqlite, restoring)', npx, [
  'prisma', 'generate', '--schema=prisma/schema.sqlite.prisma',
]);

if (restored !== 0) {
  console.error('\n✖ The SQLite client could not be restored. Run: npx prisma generate --schema=prisma/schema.sqlite.prisma');
  process.exit(restored);
}

console.log(code === 0 ? '\n✔ Types are sound against Postgres.' : '\n✖ Type errors against the Postgres client.');
process.exit(code);
