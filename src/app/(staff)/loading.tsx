/**
 * Shown the instant a staff route starts loading.
 *
 * Without a loading boundary the App Router keeps the previous screen on
 * display until the next one is fully ready, so a click produced no visible
 * response and people clicked again. A skeleton in the shape of a page is a
 * better answer than a spinner: it says what is arriving, not merely that
 * something is.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="space-y-2">
        <div className="skeleton h-7 w-52 rounded-lg" />
        <div className="skeleton h-3.5 w-72 rounded" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton mt-2.5 h-6 w-24 rounded" />
            <div className="skeleton mt-2 h-3 w-16 rounded" />
          </div>
        ))}
      </div>

      <div className="card p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2.5">
            <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="skeleton h-3.5 rounded" style={{ width: `${58 - i * 4}%` }} />
              <div className="skeleton h-2.5 rounded" style={{ width: `${40 - i * 3}%` }} />
            </div>
            <div className="skeleton h-6 w-20 shrink-0 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
