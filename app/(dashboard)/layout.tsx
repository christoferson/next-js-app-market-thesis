import Link from "next/link";

const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/discover", label: "Discover" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/about", label: "About" },
];

/**
 * Application shell for the dashboard routes. Server component: it renders only
 * static chrome, so no client bundle is needed.
 *
 * D1 runs on the demo provider, so the demo indicator and the demo notice in
 * the footer are always present — a user must never read fixture values as
 * current market data.
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-stone-200 bg-white/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/discover"
              className="rounded-sm text-base font-semibold tracking-tight text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
            >
              Market Thesis
            </Link>
            <span className="rounded-sm border border-stone-300 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-stone-600 uppercase">
              Demo data
            </span>
          </div>

          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-sm px-2 py-1 text-sm text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mx-auto w-full max-w-6xl px-4 pb-3 text-sm text-stone-500 sm:px-6">
          Know why you invested—and when the facts change.
        </p>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>

      <footer className="border-t border-stone-200 bg-white/60">
        <div className="mx-auto w-full max-w-6xl space-y-1 px-4 py-6 text-xs leading-relaxed text-stone-500 sm:px-6">
          <p>
            Market Thesis is a research tool, not financial advice. Market data
            may be delayed or incomplete. Verify information before making
            investment decisions.
          </p>
          <p>Demo data — not current market information.</p>
        </div>
      </footer>
    </div>
  );
}
