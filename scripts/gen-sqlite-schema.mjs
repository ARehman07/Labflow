#!/usr/bin/env node
/**
 * Generates prisma/schema.sqlite.prisma from prisma/schema.prisma.
 *
 * SQLite (via Prisma) supports neither native enums nor @db.* type attributes,
 * so the local dev schema is a mechanical transform of the canonical Postgres
 * one. Never edit the .sqlite file by hand — it is overwritten.
 *
 * Run: npm run db:sqlite
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'prisma', 'schema.prisma');
const out = join(root, 'prisma', 'schema.sqlite.prisma');

let schema = readFileSync(src, 'utf8');

// 1. Collect enum names, then delete the enum blocks.
const enumNames = [...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]);
schema = schema.replace(/^enum\s+\w+\s*\{[^}]*\}\n?/gm, '');

// 2. Enum-typed fields become String. Matches "  fieldName  EnumName" plus any
//    modifiers (?, [], @default(...), etc.) that follow.
for (const name of enumNames) {
  schema = schema.replace(
    new RegExp(`^(\\s+\\w+\\s+)${name}(\\??)(\\s|$)`, 'gm'),
    '$1String$2$3',
  );
}

// 3. Enum defaults are bare identifiers in Postgres; SQLite needs quoted strings.
schema = schema.replace(/@default\(([A-Z][A-Z0-9_]*)\)/g, '@default("$1")');

// 4. Drop native type attributes (@db.Decimal(12,2), @db.Text, ...).
schema = schema.replace(/\s+@db\.\w+(\([^)]*\))?/g, '');

// 5. Json is unsupported on SQLite — store as String.
schema = schema.replace(/^(\s+\w+\s+)Json(\??)(\s|$)/gm, '$1String$2$3');

// 6. Swap the provider.
schema = schema.replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"');

// 7. Collapse the blank runs left by the deleted enum blocks.
schema = schema.replace(/\n{3,}/g, '\n\n');

writeFileSync(
  out,
  '// GENERATED FILE — do not edit. Source: prisma/schema.prisma\n' +
    '// Regenerate with: npm run db:sqlite\n' +
    schema,
);

console.log(
  `wrote ${out}\n  ${enumNames.length} enums inlined as String: ${enumNames.join(', ')}`,
);
