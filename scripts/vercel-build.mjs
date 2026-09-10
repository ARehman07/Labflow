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

/**
 * Vercel's Postgres integration applies your chosen prefix to the *whole*
 * standard name, so a database appears as STORAGE_POSTGRES_URL rather than
 * STORAGE_URL. Enumerating names cannot keep up with that; match on the suffix
 * and accept any prefix. Values are verified to be Postgres URLs, because the
 * same integration also exports ..._PGHOST, ..._PGPASSWORD and friends.
 */
const RUNTIME_SUFFIXES = [
  'POSTGRES_PRISMA_URL', 'DATABASE_URL', 'POSTGRES_URL',
  'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING',
];
// Migrations want a direct connection: poolers refuse their advisory locks.
const DIRECT_SUFFIXES = [
  'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING',
  'POSTGRES_PRISMA_URL', 'DATABASE_URL', 'POSTGRES_URL',
];

const isPostgresUrl = (v) => typeof v === 'string' && /^postgres(ql)?:\/\/\S/.test(v.trim());
// ..._NO_SSL is a real variable Neon exports; never send credentials in clear.
const isUsableName = (n) => !/_NO_SSL$/i.test(n);

const findBySuffix = (suffixes) => {
  for (const suffix of suffixes) {
    const names = Object.keys(process.env)
      .filter(isUsableName)
      .filter((k) => k === suffix || k.endsWith(`_${suffix}`))
      .sort((a, b) => a.length - b.length);
    for (const name of names) {
      if (isPostgresUrl(process.env[name])) return { name, value: process.env[name].trim() };
    }
  }
  return null;
};

// An explicitly set DATABASE_URL is the override escape hatch; it must outrank
// anything the host injected.
const runtime =
  (isPostgresUrl(process.env.DATABASE_URL)
    ? { name: 'DATABASE_URL', value: process.env.DATABASE_URL.trim() }
    : null)
  ?? findBySuffix(RUNTIME_SUFFIXES);
const migrate =
  (isPostgresUrl(process.env.DIRECT_URL) ? { name: 'DIRECT_URL', value: process.env.DIRECT_URL.trim() } : null)
  ?? findBySuffix(DIRECT_SUFFIXES)
  ?? runtime;

if (!runtime) {
  // Say what IS present, not just what is missing. "Not found" alone cannot
  // distinguish "no database attached" from "attached, but the variables are
  // scoped to a different environment" or "named something unexpected" — and
  // those need opposite fixes. Names only; a value would leak into the log.
  const seen = Object.keys(process.env)
    .filter((k) => /POSTGRES|DATABASE|STORAGE|NEON|SUPABASE|^PG|DB_/i.test(k))
    .sort();

  console.error(
    '\n✖ No Postgres connection string found.\n\n' +
    '  Looked for: DATABASE_URL, POSTGRES_PRISMA_URL, STORAGE_PRISMA_URL,\n' +
    '              POSTGRES_URL, STORAGE_URL, POSTGRES_URL_NON_POOLING,\n' +
    '              STORAGE_URL_NON_POOLING, DATABASE_URL_UNPOOLED\n\n' +
    (seen.length
      ? `  Database-ish variables this build CAN see (names only):\n` +
        seen.map((k) => `    · ${k}`).join('\n') +
        '\n\n  One of these is probably the connection string under a name not\n' +
        '  listed above. Either rename it to DATABASE_URL, or tell me the name.\n'
      : '  This build can see NO database-related variables at all.\n\n' +
        '  That usually means the variables are scoped to a different\n' +
        '  environment. In Settings → Environment Variables, check that\n' +
        '  Production, Preview and Development are all ticked, then redeploy —\n' +
        '  environment variables are read at build time, so a change needs a\n' +
        '  new build to take effect.\n') +
    '\n  SQLite cannot be used here: serverless functions get an ephemeral,\n' +
    '  read-only filesystem.\n',
  );
  process.exit(1);
}

// AUTH_SECRET is not needed to compile, so without this check the build goes
// green and every sign-in then fails at runtime with nothing in the build log
// to explain it. Fail here instead, where the message is visible.
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.trim() === '') {
  console.error(
    '\n✖ AUTH_SECRET is not set.\n\n' +
    '  Sessions are signed with it. Without it the build would succeed and\n' +
    '  every login would fail, with nothing here to say why.\n\n' +
    '  Generate one:      openssl rand -base64 32\n' +
    '  Then add it in:    Project → Settings → Environment Variables\n' +
    '  Add AUTH_TRUST_HOST=true at the same time.\n',
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
