'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, apiUrl, CheckAnswerResult, LearnWord, VocabularyCheck } from '@/lib/api';
import { canSpeak, playRecording, speak } from '@/lib/speech';
import { Icon } from './Icon';

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
  const [asked, setAsked] = useState(false);

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

  /**
   * Asks her teacher to record the words this browser cannot say.
   *
   * The message names them, so the teacher knows what to record without
   * having to work out which browser the child is using.
   */
  async function askTeacherToRecord() {
    setBusy(true);
    try {
      const list = silentWords.map((w) => w.wordEn).join(', ');
      await api.post('/messages/mine', {
        body:
          `My browser cannot read words aloud, so I cannot finish these words: ${list}. ` +
          'Please could you record them for me?',
      });
      setAsked(true);
      setProblem(null);
    } catch (caught) {
      setProblem(
        caught instanceof ApiError ? caught.message : 'That message could not be sent.',
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * Asks her teacher for what a check needs.
   *
   * A word with no meaning recorded, or a unit with fewer than three words
   * that have meanings, cannot be checked — and a word that cannot be checked
   * cannot be finished. The API refuses rather than inventing a question
   * (client, 2026-08-30), which is right, and leaves her needing a way to say
   * so to somebody who can fix it.
   */
  async function askTeacherAboutCheck(word: LearnWord) {
    setBusy(true);
    try {
      await api.post('/messages/mine', {
        body:
          `I cannot finish the word "${word.wordEn}" because its check will not open. ` +
          'Please could you add the Arabic meanings for this unit?',
      });
      setAsked(true);
      setProblem(null);
    } catch (caught) {
      setProblem(
        caught instanceof ApiError ? caught.message : 'That message could not be sent.',
      );
    } finally {
      setBusy(false);
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
  /** Words she cannot hear here: no browser voice and no recording. */
  const silentWords = words.filter((w) => !w.audioPlayed && !w.teacherAudioUrl);

  return (
    <div className="stack">
      <div data-kind="vocabulary">
        <p className="muted" data-testid="vocab-summary" style={{ margin: '0 0 .5rem' }}>
          {learned} of {words.length} words learned. A word counts once you have read it, heard it
          and answered its check.
        </p>
        <div className="tally" aria-hidden="true">
          {words.map((w) => (
            <i key={w.id} data-on={w.learned} />
          ))}
        </div>
      </div>

      {/*
        A word cannot be finished until it has been heard, and she may not
        simply say she heard it. So a browser with no voice and a word with no
        recording is a dead end — and a dead end has to come with a way out,
        or she is stuck with no idea why. There are exactly two ways out and
        this names both: a browser that can speak, or her teacher recording
        the words. The second is one tap, because "ask your teacher" is not
        much help to an eleven-year-old on her own.
      */}
      {!supported && (
        <div className="alert warn" role="status" data-testid="no-voice">
          {silentWords.length === 0 ? (
            <p style={{ margin: 0 }}>
              This browser has no voice installed. Every word here has a recording from your
              teacher, so you can still finish them all. Use “Your teacher’s voice” on each card.
            </p>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                This browser has no voice installed, so {silentWords.length}{' '}
                {silentWords.length === 1 ? 'word' : 'words'} cannot be played here. A word has to
                be heard before it counts, so there are two ways forward:
              </p>
              <ul style={{ margin: '.5rem 0 0', paddingInlineStart: '1.2rem' }}>
                <li>Open this page in Chrome, Edge or Safari, which can read words aloud.</li>
                <li>Ask your teacher to record them for you.</li>
              </ul>
              <div className="row" style={{ marginTop: '.6rem' }}>
                <button
                  className="small"
                  onClick={askTeacherToRecord}
                  disabled={busy || asked}
                  data-testid="ask-for-recordings"
                >
                  {asked ? 'Your teacher has been asked' : 'Ask my teacher to record these words'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {problem && (
        <p className="alert error" role="alert">
          {problem}
        </p>
      )}

      <div className="grid" data-kind="vocabulary">
        {words.map((word) => (
          <div
            key={word.id}
            className="word-card"
            data-testid="word-card"
            data-learned={word.learned}
            data-kind="vocabulary"
          >
            {/*
              The word itself is the largest thing on the screen. Everything
              else on this card — the picture, the meaning, the three lamps —
              is support for it, which is why it gets the display face at full
              size and nothing else competes.
            */}
            <span className="word-en">{word.wordEn}</span>

            {word.pictureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={apiUrl(word.pictureUrl)}
                alt={`A picture of ${word.wordEn}`}
                className="word-picture"
                data-testid="word-picture"
              />
            )}

            {/* The interface is English; only the meaning is Arabic, so the
                direction is set here and not on the page (SRS 39). */}
            {word.meaningAr && (
              <p className="word-ar" dir="rtl" lang="ar" style={{ margin: 0 }}>
                {word.meaningAr}
              </p>
            )}

            {word.partOfSpeech && (
              <p className="muted" style={{ margin: 0 }}>{word.partOfSpeech}</p>
            )}
            {word.exampleSentence && (
              <p className="muted" style={{ margin: 0 }}>{word.exampleSentence}</p>
            )}

            {/* Hearing the word is a step, so the control for it is the one
                that looks like the main thing to press. */}
            <button
              className="speak-btn"
              onClick={() => play(word)}
              disabled={speaking === word.id}
              data-playing={speaking === word.id}
              data-testid={`play-${word.wordEn}`}
              aria-label={`Hear the word ${word.wordEn}`}
            >
              <Icon name="sound" className="ico-lg" />
            </button>

            {/*
              Read, heard, checked — as three lamps rather than a checklist.
              She can see at a glance what is still outstanding without the
              card turning into a form.
            */}
            <div className="lamps" data-testid="word-lamps">
              <span className="lamp" data-on={word.seen}>
                <i className="dot" />
                Read
              </span>
              <span className="lamp" data-on={word.audioPlayed}>
                <i className="dot" />
                Heard
              </span>
              <span className="lamp" data-on={word.checked}>
                <i className="dot" />
                Checked
              </span>
            </div>

            {word.learned && (
              <span className="badge active" data-testid="word-learned">
                <Icon name="tick" size={12} />
                Learned
              </span>
            )}

            <div className="row" style={{ justifyContent: 'center' }}>
              {word.teacherAudioUrl && (
                <button
                  className="small"
                  onClick={() => playRecordingFor(word)}
                  disabled={speaking === word.id}
                  data-testid={`teacher-audio-${word.wordEn}`}
                  aria-label={`Hear your teacher say ${word.wordEn}`}
                >
                  Your teacher&rsquo;s voice
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
                asked={asked}
                onAsk={() => askTeacherAboutCheck(word)}
                onAnswer={(text) => answer(word.id, text)}
                onClose={() => {
                  setChecking(null);
                  setVerdict(null);
                }}
              />
            )}
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
  asked,
  onAsk,
  onAnswer,
  onClose,
}: {
  check: VocabularyCheck;
  busy: boolean;
  verdict: CheckAnswerResult | null;
  asked: boolean;
  onAsk: () => void;
  onAnswer: (text: string) => void;
  onClose: () => void;
}) {
  if (!check.available) {
    return (
      <div className="alert warn" role="status" data-testid="check-unavailable">
        {check.reason}
        {/*
          Nothing she can do on her own fixes this, so the only useful control
          is one that reaches somebody who can.
        */}
        <div className="row" style={{ marginTop: '.5rem' }}>
          <button className="small" onClick={onAsk} disabled={busy || asked} data-testid="ask-about-check">
            {asked ? 'Your teacher has been asked' : 'Tell my teacher'}
          </button>
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
