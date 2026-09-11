'use client';

import './globals.css';

/**
 * The last resort, when even the root layout failed. It renders its own
 * <html>, so no app providers exist here — no theme, no translations — which
 * is why the text is given in both languages at once.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-canvas px-4">
        <div className="card flex w-full max-w-md flex-col items-center gap-3 px-6 py-12 text-center">
          <h1 className="text-xl font-extrabold text-strong">Something went wrong</h1>
          <p className="text-sm text-muted">LabFlow could not load. Your data is safe — please try again.</p>
          <p dir="rtl" className="text-sm text-muted">کچھ غلط ہو گیا۔ آپ کا ڈیٹا محفوظ ہے — دوبارہ کوشش کریں۔</p>
          <button
            onClick={reset}
            className="mt-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Try again · دوبارہ کوشش کریں
          </button>
        </div>
      </body>
    </html>
  );
}
