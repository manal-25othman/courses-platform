'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, Message } from '@/lib/api';

/**
 * Feedback between a teacher and one student.
 *
 * The same component serves both sides — what differs is only which routes it
 * talks to, which the caller supplies. There is nothing live here: messages
 * are loaded when the page opens and again after one is sent.
 */
export function Conversation({
  loadPath,
  sendPath,
  readPath,
  placeholder,
  emptyText,
  bare = false,
}: {
  loadPath: string;
  sendPath: string;
  readPath: string;
  placeholder: string;
  emptyText: string;
  /**
   * True where the caller already frames this in a titled panel, so the
   * component's own heading and card would be a second one around it.
   */
  bare?: boolean;
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const thread = await api.get<Message[]>(loadPath);
      setMessages(thread);
      // Opening the conversation is reading it.
      if (thread.some((m) => !m.fromMe && !m.readAt)) {
        await api.post(readPath).catch(() => undefined);
      }
      setError(null);
    } catch (caught) {
      setMessages([]);
      setError(caught instanceof ApiError ? caught.message : 'Could not load your messages.');
    }
  }, [loadPath, readPath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Scroll the thread, not the page. `scrollIntoView` walks up to the
    // nearest scrollable ancestor, and where the thread is short enough not to
    // scroll on its own that ancestor is the document — which landed a teacher
    // part-way down the student's page on every load.
    const end = bottom.current;
    const thread = end?.parentElement;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (body === '') return;

    setBusy(true);
    setError(null);
    try {
      await api.post(sendPath, { body });
      setDraft('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Your message was not sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={bare ? 'stack' : 'card stack'} data-testid="conversation">
      {!bare && <h2 style={{ margin: 0 }}>Messages</h2>}

      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      {messages === null ? (
        <p className="muted">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="muted" data-testid="no-messages">
          {emptyText}
        </p>
      ) : (
        <div className="thread" data-testid="message-thread">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`msg ${message.fromMe ? 'from-me' : 'from-them'}`}
              data-testid={message.fromMe ? 'message-mine' : 'message-theirs'}
            >
              <div className="who">{message.fromMe ? 'You' : message.senderName}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div>
              <div className="when">
                {new Date(message.createdAt).toLocaleString('en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                {message.fromMe && (message.readAt ? ' · Read' : ' · Sent')}
              </div>
            </div>
          ))}
          <div ref={bottom} />
        </div>
      )}

      <label htmlFor="messageBody">Write a message</label>
      <textarea
        id="messageBody"
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        data-testid="message-body"
      />
      <div className="row">
        <button
          className="primary"
          onClick={send}
          disabled={busy || draft.trim() === ''}
          data-testid="send-message"
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
