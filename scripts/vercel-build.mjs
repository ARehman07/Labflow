/**
 * Vercel build entry point.
 *
 * The Prisma CLI reads DATABASE_URL and nothing else. Managed Postgres add-ons
 * usually publish the connection string under their own name — Vercel's
 * integration lets you choose the prefix, so it can arrive as POSTGRES_URL,
 * STORAGE_URL, STORAGE_PRISMA_URL and so on. When that happens Prisma reports
 * DATABASE_URL as "an empty string" and the build dies on a database that is
 * provisioned and healthy.
 *
 * So: resolve the URL first, then run each step with it in the environment.
 * Migrations prefer a direct (non-pooled) connection, because the advisory
 * locks they take are commonly refused through a pooler.
 */
import { spawnSync } from 'node:child_process';

const pick = (...names) => {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === 'string' && v.trim() !== '') return { name: n, value: v.trim() };
  }
  return null;
};

const runtime = pick(
  'DATABASE_URL',
  'POSTGRES_PRISMA_URL', 'STORAGE_PRISMA_URL',
  'POSTGRES_URL', 'STORAGE_URL',
  'POSTGRES_URL_NON_POOLING', 'STORAGE_URL_NON_POOLING', 'DATABASE_URL_UNPOOLED',
);

// Migrations want the unpooled connection when one is offered.
const migrate = pick(
  'DIRECT_URL',
  'POSTGRES_URL_NON_POOLING', 'STORAGE_URL_NON_POOLING', 'DATABASE_URL_UNPOOLED',
) ?? runtime;

if (!runtime) {
  console.error(
    '\n✖ No Postgres connection string found.\n\n' +
    '  Looked for: DATABASE_URL, POSTGRES_PRISMA_URL, STORAGE_PRISMA_URL,\n' +
    '              POSTGRES_URL, STORAGE_URL, POSTGRES_URL_NON_POOLING,\n' +
    '              STORAGE_URL_NON_POOLING, DATABASE_URL_UNPOOLED\n\n' +
    '  Attach a Postgres database to the project (Storage → Create Database),\n' +
    '  or set DATABASE_URL manually. SQLite cannot be used here: serverless\n' +
    '  functions get an ephemeral, read-only filesystem.\n',
  );
  process.exit(1);
}

console.log(`Using ${runtime.name} for the app, ${migrate.name} for migrations.`);

const steps = [
  ['npx', ['prisma', 'generate'], runtime.value],
  ['npx', ['prisma', 'migrate', 'deploy'], migrate.value],
  ['npx', ['next', 'build'], runtime.value],
];

for (const [cmd, args, url] of steps) {
  const label = [cmd, ...args].join(' ');
  console.log(`\n▸ ${label}`);
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
  if (res.status !== 0) {
    console.error(`\n✖ ${label} failed.`);
    process.exit(res.status ?? 1);
  }
}
