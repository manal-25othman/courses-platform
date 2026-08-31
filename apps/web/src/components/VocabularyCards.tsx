'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, apiUrl, CheckAnswerResult, LearnWord, VocabularyCheck } from '@/lib/api';
import { canSpeak, playRecording, speak } from '@/lib/speech';

/**
 * The word list.
 *
 * Three steps finish a word: read it, hear it, then answer a short check on
 * it. The check is what makes the first two mean something — tapping through
 * cards quickly is not learning, and without it that is all completing a unit
 * would take (client, 2026-08-30).
 *
 * The card reports each step separately, so she is never left wondering why a
 * word she has looked at is still outstanding.
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
  const [checking, setChecking] = useState<VocabularyCheck | null>(null);
  const [verdict, setVerdict] = useState<CheckAnswerResult | null>(null);
  const [busy, setBusy] = useState(false);

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

  /** Records that the word was heard, naming what played it. */
  async function recordHeard(word: LearnWord, source: 'browser_tts' | 'teacher_audio') {
    await api.post(`/learn/vocabulary/${word.id}/audio-played`, { source }).catch(() => undefined);
    await onChanged();
  }

  /** Plays the teacher's own recording of the word. */
  async function playRecordingFor(word: LearnWord) {
    if (!word.teacherAudioUrl) return;

    setProblem(null);
    setSpeaking(word.id);

    const played = await playRecording(apiUrl(word.teacherAudioUrl));

    setSpeaking(null);

    if (!played) {
      setProblem('That recording could not be played. Please try again.');
      return;
    }

    await recordHeard(word, 'teacher_audio');
  }

  /**
   * Plays the word with the browser's own voice, falling back to the
   * teacher's recording when the browser has no working voice.
   *
   * Nothing here marks the word heard unless something actually played. There
   * is deliberately no button that simply says "I heard it" — a student may
   * not claim to have heard a word (client, 2026-08-31).
   */
  async function play(word: LearnWord) {
    setProblem(null);
    setSpeaking(word.id);

    const result = await speak(word.wordEn);

    if (result.spoke) {
      setSpeaking(null);
      await recordHeard(word, 'browser_tts');
      return;
    }

    // A browser with no voice cannot be retried into working. If the teacher
    // has recorded this word, that is the way through; if she has not, the
    // message says so rather than leaving the student pressing a dead button.
    const noVoice = result.reason === 'unsupported' || result.reason === 'no-voice';

    if (noVoice) setSupported(false);

    if (word.teacherAudioUrl) {
      const played = await playRecording(apiUrl(word.teacherAudioUrl));
      setSpeaking(null);

      if (played) {
        await recordHeard(word, 'teacher_audio');
        return;
      }

      setProblem('That word could not be played. Please try again.');
      return;
    }

    setSpeaking(null);

    if (!noVoice) {
      setProblem('That word could not be played. Please try again.');
    }
  }

  async function openCheck(word: LearnWord) {
    setProblem(null);
    setVerdict(null);
    setBusy(true);
    try {
      setChecking(await api.get<VocabularyCheck>(`/learn/vocabulary/${word.id}/check`));
    } catch (caught) {
      setProblem(caught instanceof ApiError ? caught.message : 'Could not open the check.');
    } finally {
      setBusy(false);
    }
  }

  async function answer(itemId: string, text: string) {
    setBusy(true);
    try {
      const result = await api.post<CheckAnswerResult>(`/learn/vocabulary/${itemId}/check`, {
        answer: text,
      });
      setVerdict(result);
      await onChanged();
      if (result.correct) {
        // Right: the word is finished, so the check closes.
        setChecking(null);
      } else {
        // Wrong: a fresh question, so she is not just guessing the same list.
        setChecking(await api.get<VocabularyCheck>(`/learn/vocabulary/${itemId}/check`));
      }
    } catch (caught) {
      setProblem(caught instanceof ApiError ? caught.message : 'Could not send your answer.');
    } finally {
      setBusy(false);
    }
  }

  const learned = words.filter((w) => w.learned).length;

  return (
    <div className="stack">
      <p className="muted" data-testid="vocab-summary">
        {learned} of {words.length} words learned. A word counts once you have read it, heard it and
        answered its check.
      </p>

      {!supported && (
        <p className="alert warn" role="status" data-testid="no-voice">
          {words.some((w) => w.teacherAudioUrl)
            ? 'This browser has no voice installed. Words your teacher has recorded will still play; the rest cannot be played here. Open the site in Chrome, Edge or Safari to finish them.'
            : 'This browser has no voice installed, so words cannot be played or marked as heard here. Open the site in Chrome, Edge or Safari to finish your words.'}
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

            {word.pictureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={apiUrl(word.pictureUrl)}
                alt={`A picture of ${word.wordEn}`}
                className="word-picture"
                data-testid="word-picture"
              />
            )}

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
              {word.teacherAudioUrl && (
                <button
                  className="small"
                  onClick={() => playRecordingFor(word)}
                  disabled={speaking === word.id}
                  data-testid={`teacher-audio-${word.wordEn}`}
                  aria-label={`Hear your teacher say ${word.wordEn}`}
                >
                  🎧 Teacher&rsquo;s voice
                </button>
              )}
              {!word.seen && (
                <button className="small" onClick={() => markSeen(word)} data-testid="mark-seen">
                  I have read this
                </button>
              )}
              {word.checkReady && (
                <button
                  className="primary small"
                  onClick={() => openCheck(word)}
                  disabled={busy}
                  data-testid={`check-${word.wordEn}`}
                >
                  Check what I know
                </button>
              )}
            </div>

            {checking && checking.itemId === word.id && (
              <VocabularyCheckPanel
                check={checking}
                busy={busy}
                verdict={verdict}
                onAnswer={(text) => answer(word.id, text)}
                onClose={() => {
                  setChecking(null);
                  setVerdict(null);
                }}
              />
            )}

            {verdict && !verdict.correct && (!checking || checking.itemId !== word.id) && null}

            <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>
              Read {word.seen ? '✓' : '—'} · Heard {word.audioPlayed ? '✓' : '—'} · Checked{' '}
              {word.checked ? '✓' : '—'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The check itself.
 *
 * The word, and Arabic meanings to choose between. Every choice is a meaning a
 * teacher entered for some word in this unit — nothing here is written or
 * translated by the platform. Where a unit does not hold enough for a fair
 * question, the API says so and that message is shown instead.
 */
function VocabularyCheckPanel({
  check,
  busy,
  verdict,
  onAnswer,
  onClose,
}: {
  check: VocabularyCheck;
  busy: boolean;
  verdict: CheckAnswerResult | null;
  onAnswer: (text: string) => void;
  onClose: () => void;
}) {
  if (!check.available) {
    return (
      <div className="alert warn" role="status" data-testid="check-unavailable">
        {check.reason}
        <div className="row" style={{ marginTop: '.5rem' }}>
          <button className="small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="stack"
      style={{ borderTop: '1px solid var(--border)', paddingTop: '.75rem' }}
      data-testid="vocab-check"
    >
      <strong style={{ fontSize: '.95rem' }}>What does “{check.wordEn}” mean?</strong>

      {verdict && !verdict.correct && (
        <p className="alert error" role="alert" data-testid="check-wrong">
          Not quite. Look at the word again and try once more.
        </p>
      )}

      <div className="stack" style={{ gap: '.4rem' }}>
        {check.options.map((option) => (
          <button
            key={option.id}
            className="choice"
            disabled={busy}
            onClick={() => onAnswer(option.text)}
            data-testid={`check-option-${option.id}`}
            style={{ textAlign: 'start', fontWeight: 400 }}
          >
            {/* The meanings are Arabic; the interface around them stays English. */}
            <span dir="rtl" lang="ar">
              {option.text}
            </span>
          </button>
        ))}
      </div>

      <div className="row">
        <button className="small" onClick={onClose} disabled={busy}>
          Not now
        </button>
      </div>
    </div>
  );
}
