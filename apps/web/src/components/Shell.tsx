'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * The brand mark.
 *
 * "Smart Shift" is about moving up a stage, so the mark is a chevron stepping
 * up inside a square — the smallest possible drawing of the idea. It is not a
 * literal illustration of anything; it just has to be recognisable at 28px on
 * a phone.
 */
export function Brandmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brandmark">
      <span className="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
             strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 15.5 9.5 11l3.5 3.5L19 8.5" />
        </svg>
      </span>
      {!compact && (
        <span className="name">
          TOP GOAL 3
          <span className="sub">Smart Shift</span>
        </span>
      )}
    </span>
  );
}

/**
 * Where a student can go. Three real routes and no invented ones.
 *
 * The same list is drawn twice, because a phone and a laptop want different
 * shapes: a thumb bar at the bottom of a small screen, and a row in the
 * header on a large one. Stretching the thumb bar across a desktop would put
 * the primary navigation as far from the cursor as it is possible to get —
 * and leaving it out, as this did before, hid Games on desktop entirely.
 */
const STUDENT_NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/home', label: 'Home', icon: 'home' },
  { href: '/games', label: 'Games', icon: 'games' },
  { href: '/messages', label: 'Teacher', icon: 'message' },
];

function useHere() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(`${href}/`);
}

/** The bar a student's thumb reaches, on a phone only. */
export function StudentNav() {
  const here = useHere();
  return (
    <nav className="navbar" aria-label="Sections" style={{ gridTemplateColumns: `repeat(${STUDENT_NAV.length}, 1fr)` }}>
      {STUDENT_NAV.map((item) => (
        <Link key={item.href} href={item.href} aria-current={here(item.href) ? 'page' : undefined}>
          <Icon name={item.icon} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** The same three, in the header, from tablet width up. */
export function StudentTopNav() {
  const here = useHere();
  return (
    <nav className="topnav" aria-label="Sections">
      {STUDENT_NAV.map((item) => (
        <Link key={item.href} href={item.href} aria-current={here(item.href) ? 'page' : undefined}>
          <Icon name={item.icon} size={17} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The person signed in, as her own initial.
 *
 * Small, but it is the one thing on the header that is hers rather than the
 * product's — and on a shared classroom device it is also the fastest way to
 * see whose account is open.
 */
export function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span className="avatar" aria-hidden="true">
      {initial}
    </span>
  );
}

export function TopBar({ right, nav = false }: { right?: ReactNode; nav?: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Brandmark />
        {nav && <StudentTopNav />}
        <span style={{ flex: 1 }} />
        {right}
      </div>
    </header>
  );
}
