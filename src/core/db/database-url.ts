/**
 * Works out the Postgres connection string, whatever the host chose to call it.
 *
 * Prisma reads exactly one variable — `DATABASE_URL`. Managed Postgres add-ons
 * rarely set that name. Vercel's integration lets you choose a prefix and then
 * applies it to the *whole* standard name, so a database can arrive as
 * `STORAGE_POSTGRES_URL`, `STORAGE_DATABASE_URL_UNPOOLED`,
 * `MYDB_POSTGRES_PRISMA_URL` and so on. Vercel also injects an empty
 * `DATABASE_URL`, which Prisma then reports as "an empty string" — on a
 * database that is provisioned and healthy.
 *
 * Listing every possible name is a losing game, so match on the suffix and
 * accept any prefix. Values are checked to actually be Postgres URLs, because
 * the same integration also exports `..._PGHOST`, `..._PGPASSWORD` and friends.
 */

/** Ordered best-first. A pooled URL suits serverless; Prisma-tuned is better still. */
const RUNTIME_SUFFIXES = [
  'POSTGRES_PRISMA_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
] as const;

/** Migrations want a direct connection: poolers refuse their advisory locks. */
const DIRECT_SUFFIXES = [
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
  'POSTGRES_PRISMA_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
] as const;

const isPostgresUrl = (v: unknown): v is string =>
  typeof v === 'string' && /^postgres(ql)?:\/\/\S/.test(v.trim());

/** `..._NO_SSL` is a real variable Neon exports; never send credentials in clear. */
const isUsableName = (name: string) => !/_NO_SSL$/i.test(name);

function findBySuffix(env: NodeJS.ProcessEnv, suffixes: readonly string[]): { name: string; value: string } | undefined {
  for (const suffix of suffixes) {
    // Exact match wins over a prefixed one, and shorter prefixes win over longer.
    const names = Object.keys(env)
      .filter(isUsableName)
      .filter((k) => k === suffix || k.endsWith(`_${suffix}`))
      .sort((a, b) => a.length - b.length);
    for (const name of names) {
      const value = env[name];
      if (isPostgresUrl(value)) return { name, value: value.trim() };
    }
  }
  return undefined;
}

/**
 * The URL the application should use at runtime. An explicitly set
 * `DATABASE_URL` always wins — it is the escape hatch for overriding whatever
 * the host injected, so suffix matching must never outrank it.
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  if (isPostgresUrl(env.DATABASE_URL)) return { name: 'DATABASE_URL', value: env.DATABASE_URL!.trim() };
  return findBySuffix(env, RUNTIME_SUFFIXES);
}

/** The URL migrations should use. Honours an explicit DIRECT_URL first. */
export function resolveDirectUrl(env: NodeJS.ProcessEnv = process.env) {
  if (isPostgresUrl(env.DIRECT_URL)) return { name: 'DIRECT_URL', value: env.DIRECT_URL!.trim() };
  return findBySuffix(env, DIRECT_SUFFIXES) ?? resolveDatabaseUrl(env);
}

/**
 * Ensures `DATABASE_URL` holds a usable value before anything reads it. Safe to
 * call repeatedly; only replaces a value that is missing or empty.
 */
export function ensureDatabaseUrl(env: NodeJS.ProcessEnv = process.env): void {
  if (isPostgresUrl(env.DATABASE_URL)) return;
  const resolved = resolveDatabaseUrl(env);
  if (resolved) env.DATABASE_URL = resolved.value;
}
