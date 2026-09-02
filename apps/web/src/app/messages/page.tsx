'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, homeFor, Me, MyTeacher } from '@/lib/api';
import { StudentNav, TopBar } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Conversation } from '@/components/Conversation';

/**
 * Talking to her teacher.
 *
 * Two ways to do it, and the page is honest about the difference: messages
 * stay inside the platform, WhatsApp leaves it. The WhatsApp button appears
 * only while her own teacher has a number set — there is no number anywhere in
 * this code, and no other teacher's details ever reach this page.
 */
export default function MessagesPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [teacher, setTeacher] = useState<MyTeacher | null>(null);

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((user) => {
        if (user.role !== 'STUDENT' || user.mustChangePassword) {
          router.replace(homeFor(user));
          return;
        }
        setMe(user);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  useEffect(() => {
    if (!me) return;
    api.get<MyTeacher | null>('/teachers/mine').then(setTeacher).catch(() => setTeacher(null));
  }, [me]);

  if (!me) {
    return (
      <>
        <TopBar />
        <main className="page has-navbar">
          <div className="skeleton" style={{ height: '2rem', width: '10rem' }} />
          <div className="skeleton" style={{ height: '12rem', marginTop: '1.5rem' }} />
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar />
      <main className="page has-navbar stack">
        <h1>Your teacher</h1>

        {teacher?.whatsappUrl && (
          <div className="card" style={{ borderTop: '3px solid var(--ok)' }}>
            <div className="row" style={{ flexWrap: 'nowrap', gap: '.75rem' }}>
              <span className="mark tick">
                <Icon name="teacher" />
              </span>
              <div style={{ flex: 1 }}>
                <strong style={{ display: 'block', fontFamily: 'var(--font-display)' }}>
                  {teacher.title ? `${teacher.title} ` : ''}
                  {teacher.displayName}
                </strong>
                <span className="muted">Message her on WhatsApp if you are stuck.</span>
              </div>
            </div>
            <a
              className="button-link"
              style={{ marginTop: '.75rem', width: '100%' }}
              href={`${teacher.whatsappUrl}?text=${encodeURIComponent(
                `Hello, this is ${me.displayName} from TOP GOAL 3.`,
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              Open WhatsApp
            </a>
          </div>
        )}

        <Conversation
          loadPath="/messages/mine"
          sendPath="/messages/mine"
          readPath="/messages/mine/read"
          placeholder="Write to your teacher…"
          emptyText="Nothing here yet. Write a message and your teacher will see it next time she opens the class."
        />
      </main>
      <StudentNav />
    </>
  );
}
