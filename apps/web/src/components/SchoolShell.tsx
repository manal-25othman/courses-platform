'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, Me, SchoolSummary } from '@/lib/api';
import { Avatar } from './Shell';
import { Icon, IconName } from './Icon';

/**
 * The frame the school administrator's screens sit in.
 *
 * The same white bar a teacher gets, because she is inside a school rather
 * than above one — the dark bar belongs to the platform operator, who has no
 * school at all. What tells her which of the two jobs she is doing is the
 * mark: a teacher's bar carries the course, and hers carries the name of the
 * school she runs. She is not preparing a lesson; she is running the place
 * the lessons happen in.
 *
 * Her navigation is the teacher's four with the Dashboard swapped out. That
 * screen is written around one teacher's own class — "this class", "worth a
 * look today" — which is nobody's class when the reader teaches none of them.
 * The rest are school-wide for her already, so they are hers as they stand.
 */
const SCHOOL_NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/school', label: 'School', icon: 'home' },
  { href: '/school/teachers', label: 'Teachers', icon: 'teacher' },
  { href: '/students', label: 'Students', icon: 'words' },
  { href: '/progress', label: 'Progress', icon: 'progress' },
  { href: '/content', label: 'Curriculum', icon: 'grammar' },
];

export function SchoolHeader({ me, schoolName }: { me: Me; schoolName?: string }) {
  const router = useRouter();
  const path = usePathname() ?? '';

  // The school screens already know the name and pass it in. The shared
  // screens — Students, Curriculum — do not, so the bar asks for it rather
  // than showing an administrator a bar that cannot say which school she is
  // in. Skipped entirely when the name was handed over.
  const [found, setFound] = useState<string | null>(null);

  useEffect(() => {
    if (schoolName !== undefined) return;
    let live = true;
    api
      .get<SchoolSummary>('/school/overview')
      .then((school) => {
        if (live) setFound(school.schoolName);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [schoolName]);

  const named = schoolName ?? found;

  async function signOut() {
    await api.post('/auth/logout').catch(() => undefined);
    router.push('/login');
  }

  // `/school` would otherwise mark itself current on `/school/teachers` too.
  const here = (href: string) =>
    href === '/school' ? path === href : path === href || path.startsWith(`${href}/`);

  return (
    <header className="topbar teacher-bar">
      <div className="topbar-inner">
        <span className="school-mark">
          <span className="school-glyph" aria-hidden="true">
            <Icon name="star" />
          </span>
          <span className="school-named">
            {/* The school's real name, from the school's own record. Falls
                back to the role rather than to a course name, which would be
                the wrong thing entirely to put above an administrator. */}
            <b>{named ?? 'School'}</b>
            <span>School office</span>
          </span>
        </span>
        <span className="bar-rule" aria-hidden="true" />

        <nav className="teachernav" aria-label="Sections">
          {SCHOOL_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={here(item.href) ? 'page' : undefined}
            >
              <Icon name={item.icon} size={17} />
              {item.label}
            </Link>
          ))}
        </nav>

        <span style={{ flex: 1 }} />
        <span className="who">
          <span className="who-name">{me.displayName}</span>
          <Avatar name={me.displayName} />
        </span>
        <button className="ghost small" onClick={signOut} aria-label="Sign out">
          <Icon name="signout" />
          <span className="hide-sm">Sign out</span>
        </button>
      </div>
    </header>
  );
}
