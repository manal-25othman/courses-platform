'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { api, Me } from '@/lib/api';
import { Avatar, Brandmark, TeacherNav } from './Shell';
import { Icon } from './Icon';

/**
 * The frame every teacher screen sits in.
 *
 * Before this, each teacher page carried its own row of plain buttons, so the
 * chrome drifted from screen to screen and nothing said which one she was on.
 * One shell fixes both, and gives the dashboard somewhere to belong.
 *
 * Only what her account actually holds is shown: her display name and her
 * title, both from `/teachers/me`. There is no school name, no class name and
 * no photograph anywhere in the data, so none is drawn.
 */
/**
 * Just the bar.
 *
 * The dashboard uses the full shell; the screens that already had their own
 * layout take this alone, so every teacher screen carries the same
 * navigation without any of them being rebuilt for it.
 */
export function TeacherHeader({
  me,
  teacherTitle,
}: {
  me: Me;
  teacherTitle?: string | null;
}) {
  const router = useRouter();

  async function signOut() {
    await api.post('/auth/logout').catch(() => undefined);
    router.push('/login');
  }

  const named = teacherTitle ? `${teacherTitle} ${me.displayName}` : me.displayName;

  return (
    <header className="topbar teacher-bar">
      <div className="topbar-inner">
        <Brandmark />
        <span className="bar-rule" aria-hidden="true" />
        <TeacherNav />
        <span style={{ flex: 1 }} />
        <span className="who">
          <span className="who-name">{named}</span>
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

export function TeacherShell({
  title,
  lead,
  actions,
  children,
  me,
  teacherTitle,
}: {
  /** The page's own name, for the heading and the document. */
  title: string;
  /** One factual line under it, when the page has one worth saying. */
  lead?: ReactNode;
  /** Page-level actions, sitting with the heading rather than in the header. */
  actions?: ReactNode;
  children: ReactNode;
  me: Me;
  /** "Ms", "Mrs" — set by her, and absent until she sets it. */
  teacherTitle?: string | null;
}) {
  return (
    <>
      <TeacherHeader me={me} teacherTitle={teacherTitle} />

      <main className="page teacher-page">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            {lead}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
        {children}
      </main>
    </>
  );
}
