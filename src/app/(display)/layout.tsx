// Minimal layout for the public-facing display screen — no app chrome.
export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
