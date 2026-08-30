'use client';

import { useEffect, useState } from 'react';
import { api, LearnWord } from '@/lib/api';
import { canSpeak, speak } from '@/lib/speech';

/**
 * The word list.
 *
 * A word counts as learned only once she has both looked at it and heard it
 * said (SRS 22). That is why the card reports the two separately: opening a
 * card is not finishing it, and the screen has to make that plain rather than
 * leaving her wondering why a word she has read is still outstanding.
 */
export function VocabularyCards({
  words,
  onChanged,
}: {
  words: LearnWord[];
  onChanged: () => Promise<void> | void;
}) {
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void canSpeak().then((able) => {
      if (current) setSupported(able);
    });
    return () => {
      current = false;
    };
  }, []);

  if (words.length === 0) {
    return (
      <div className="card">
        <p className="muted">This unit has no word list yet.</p>
      </div>
    );
  }

  async function markSeen(word: LearnWord) {
    if (word.seen) return;
    await api.post(`/learn/vocabulary/${word.id}/seen`).catch(() => undefined);
    await onChanged();
  }

  async function play(word: LearnWord) {
    setProblem(null);
    setSpeaking(word.id);

    const result = await speak(word.wordEn);

    setSpeaking(null);

    if (!result.spoke) {
      // Not recorded as heard, because it was not heard.
      // A browser with no voice cannot be retried into working, so it gets a
      // different message from a one-off failure.
      if (result.reason === 'unsupported' || result.reason === 'no-voice') {
        setSupported(false);
        setProblem(null);
      } else {
        setProblem('That word could not be played. Please try again.');
      }
      return;
    }

    await api.post(`/learn/vocabulary/${word.id}/audio-played`).catch(() => undefined);
    await onChanged();
  }

  const learned = words.filter((w) => w.learned).length;

  return (
    <div className="stack">
      <p className="muted" data-testid="vocab-summary">
        {learned} of {words.length} words learned. A word counts once you have read it and heard it.
      </p>

      {!supported && (
        <p className="alert warn" role="status" data-testid="no-voice">
          This browser has no voice installed, so words cannot be played or marked as heard here.
          Open the site in Chrome, Edge or Safari to finish your words.
        </p>
      )}

      {problem && (
        <p className="alert error" role="alert">
          {problem}
        </p>
      )}

      <div className="grid">
        {words.map((word) => (
          <div
            key={word.id}
            className="card stack"
            data-testid="word-card"
            data-learned={word.learned}
          >
            <div className="between">
              <span className="word-en">{word.wordEn}</span>
              {word.learned ? (
                <span className="badge active" data-testid="word-learned">
                  Learned
                </span>
              ) : (
                <span className="badge disabled">Not yet</span>
              )}
            </div>

            {word.partOfSpeech && <p className="muted" style={{ margin: 0 }}>{word.partOfSpeech}</p>}

            {/* The interface is English; only the meaning is Arabic, so the
                direction is set on this element and not on the page (SRS 39). */}
            {word.meaningAr && (
              <p className="word-ar" dir="rtl" lang="ar" style={{ margin: 0 }}>
                {word.meaningAr}
              </p>
            )}

            {word.exampleSentence && (
              <p className="muted" style={{ margin: 0 }}>
                {word.exampleSentence}
              </p>
            )}

            <div className="row">
              <button
                onClick={() => play(word)}
                disabled={speaking === word.id}
                data-testid={`play-${word.wordEn}`}
                aria-label={`Hear the word ${word.wordEn}`}
              >
                {speaking === word.id ? 'Playing…' : '🔊 Hear it'}
              </button>
              {!word.seen && (
                <button className="small" onClick={() => markSeen(word)} data-testid="mark-seen">
                  I have read this
                </button>
              )}
            </div>

            <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>
              Read {word.seen ? '✓' : '—'} · Heard {word.audioPlayed ? '✓' : '—'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
