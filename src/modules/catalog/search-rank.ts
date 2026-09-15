/**
 * How well a test matches what the counter typed — lower is better, null is no match.
 *
 * Matching happens here rather than in the database: PostgreSQL compares text
 * case-sensitively, so "cbc" or "complete" found nothing live while working
 * locally on SQLite. A lab's catalogue is a few hundred tests, small enough to
 * rank in memory, and ranking lets the obvious test come first — the code typed
 * exactly, then the initials ("cbc" → Complete Blood Count), then words.
 */
export function rankTest(test: { code: string; name: string }, query: string): number | null {
  const q = query.trim().toLowerCase().replace(/\s+/gu, ' ');
  if (!q) return 0;
  const code = test.code.toLowerCase();
  const name = test.name.toLowerCase();
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const initials = words.map((w) => w[0]).join('');
  const compact = q.replace(/[^\p{L}\p{N}]+/gu, '');
  const parts = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  if (code === q || code === compact) return 0;
  if (name === q) return 1;
  if (code.startsWith(compact) && compact.length > 0) return 2;
  if (compact.length >= 2 && initials === compact) return 3;
  if (name.startsWith(q)) return 4;
  if (words.some((w) => w.startsWith(q))) return 5;
  if (parts.length > 1 && parts.every((p) => words.some((w) => w.startsWith(p)))) return 6;
  if (compact.length >= 2 && initials.startsWith(compact)) return 7;
  if (name.includes(q) || code.includes(compact)) return 8;
  return null;
}

/** The tests that match, best first, then by name. */
export function searchTests<T extends { code: string; name: string }>(tests: T[], query: string, limit = 50): T[] {
  return tests
    .map((t) => ({ t, rank: rankTest(t, query) }))
    .filter((x): x is { t: T; rank: number } => x.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.t.name.localeCompare(b.t.name))
    .slice(0, limit)
    .map((x) => x.t);
}
