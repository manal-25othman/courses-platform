'use client';

import { useRouter } from 'next/navigation';
import { api, Me } from '@/lib/api';
import { Avatar } from './Shell';
import { Icon } from './Icon';

/**
 * The frame the platform screens sit in.
 *
 * Deliberately not the teacher's bar. Hers is white, and the pages under it
 * are about one class inside one school; this one is dark, and the pages under
 * it are about the estate — the whole set of schools, none of which the
 * operator belongs to. Same palette, same type, different room, so it is
 * obvious at a glance which of the two you are looking at.
 *
 * The mark says "Platform" rather than naming a course. TOP GOAL 3 is the
 * current client's course; the operator sits above every course there is, and
 * a bar that named one would be wrong the moment there are two.
 */

/** Where the platform screens live. Only the ones that exist are reachable. */
const AREAS = [
  { href: '/admin', label: 'Dashboard', icon: 'home' as const, ready: true },
  // Both are the next phases. They are drawn so the shape of the platform is
  // visible, and made unreachable so nothing here is a dead link.
  { href: '/admin/schools', label: 'Schools', icon: 'teacher' as const, ready: false },
  { href: '/admin/teachers', label: 'Teachers', icon: 'progress' as const, ready: false },
];

export function AdminHeader({ me, current = '/admin' }: { me: Me; current?: string }) {
  const router = useRouter();

  async function signOut() {
    await api.post('/auth/logout').catch(() => undefined);
    router.push('/login');
  }

  return (
    <header className="topbar admin-bar">
      <div className="topbar-inner">
        <span className="admin-mark">
          <span className="admin-glyph" aria-hidden="true">
            <Icon name="star" />
          </span>
          <span className="admin-wordmark">Platform</span>
        </span>
        <span className="bar-rule" aria-hidden="true" />

        <nav className="adminnav" aria-label="Platform areas">
          {AREAS.map((area) =>
            area.ready ? (
              <a
                key={area.href}
                href={area.href}
                aria-current={current === area.href ? 'page' : undefined}
              >
                <Icon name={area.icon} />
                {area.label}
              </a>
            ) : (
              // A span, not a link: there is nothing behind it yet, and a
              // link that goes nowhere is worse than one that says so.
              <span key={area.href} className="adminnav-soon" aria-disabled="true">
                <Icon name={area.icon} />
                {area.label}
                <em>next</em>
              </span>
            ),
          )}
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
