'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, Inbox } from '@/lib/api';
import { Icon } from './Icon';

/**
 * What is waiting, in the corner of every signed-in screen.
 *
 * Nothing new is stored to make this work. Messages already record when they
 * were read, and opening a conversation already marks it; this reads that same
 * fact from one endpoint and shows it. So the bell cannot disagree with the
 * thread — there is no second count to keep in step.
 *
 * It is a bell and not a notification system: no push, no sound, no badge on
 * anything outside this page. A teacher sees which of her students is waiting
 * and goes there; a student sees that her teacher has written and goes to read
 * it. That is the whole of it.
 */

/**
 * How often it looks.
 *
 * Two minutes. A message here is feedback on a piece of work, not a chat, so
 * arriving within a couple of minutes is soon enough — and a tab left open all
 * day then costs about thirty requests rather than a thousand. Polling stops
 * entirely while the tab is hidden, and one fresh look happens on return.
 */
const EVERY_MS = 120_000;

export function MessageBell({ role }: { role: 'TEACHER' | 'ADMIN' | 'STUDENT' }) {
  const router = useRouter();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    // A bell that cannot load is a bell that says nothing, never an error on
    // a page that is otherwise fine.
    try {
      setInbox(await api.get<Inbox>('/messages/inbox'));
    } catch {
      setInbox(null);
    }
  }, []);

  useEffect(() => {
    void load();

    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, EVERY_MS);

    // Coming back to the tab is the moment somebody actually wants to know.
    const onShow = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onShow);

    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [load]);

  // Close on a click outside or on Escape, like any other menu on the page.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = inbox?.unread ?? 0;

  /*
    A student has one conversation, so there is nothing to choose between:
    the bell takes her straight to it. A teacher has a class, so hers opens a
    list of who is waiting.
  */
  function press() {
    if (role === 'STUDENT') {
      router.push('/messages');
      return;
    }
    if (unread === 0) {
      router.push('/progress');
      return;
    }
    setOpen((was) => !was);
  }

  return (
    <div className="bell-wrap" ref={box}>
      <button
        className="bell"
        onClick={press}
        aria-haspopup={role === 'STUDENT' ? undefined : 'menu'}
        aria-expanded={role === 'STUDENT' ? undefined : open}
        aria-label={
          unread === 0
            ? 'Messages. Nothing new.'
            : `Messages. ${unread} unread.`
        }
        data-testid="message-bell"
        data-unread={unread > 0}
      >
        <Icon name="message" size={20} />
        {unread > 0 && (
          <span className="bell-count" data-testid="bell-count" aria-hidden="true">
            {/* Past nine it is "lots", and the exact number stops mattering. */}
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && inbox && inbox.threads.length > 0 && (
        <div className="bell-menu" role="menu" data-testid="bell-menu">
          <p className="bell-head">Waiting for a reply</p>
          {inbox.threads.map((thread) => (
            <button
              key={thread.studentId}
              role="menuitem"
              className="bell-item"
              onClick={() => {
                setOpen(false);
                router.push(`/progress/${thread.studentId}`);
              }}
              data-testid="bell-item"
            >
              <span className="bell-name">{thread.name}</span>
              <span className="bell-n">{thread.unread}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
