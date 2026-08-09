"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavLink {
  href: string;
  label: string;
}

/**
 * Main navigation. A client component only because the active route has to be
 * known in the browser: the current page is marked with `aria-current="page"`,
 * and the visual treatment adds weight and a background rather than relying on
 * color alone.
 */
export function NavLinks({ links }: { links: readonly NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {links.map((link) => {
        // A detail route such as /discover/<id> keeps its section marked.
        const isActive =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-sm px-2 py-1 text-sm transition-colors motion-reduce:transition-none hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 ${
              isActive
                ? "bg-stone-100 font-semibold text-stone-900"
                : "text-stone-700"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
