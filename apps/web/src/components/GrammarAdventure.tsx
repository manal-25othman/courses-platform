'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdventureAnswer,
  AdventureCheckpoint,
  AdventureRound,
  ApiError,
  api,
} from '@/lib/api';
import type { SceneKind } from '@/lib/world';
import { Scene } from '@/components/world/Scene';
import { Girl } from '@/components/world/Girl';
import { Obstacle } from '@/components/world/Obstacle';
import { Icon } from '@/components/Icon';

/**
 * Grammar Adventure.
 *
 * A walk across the unit's own world towards somewhere worth reaching. The
 * road is blocked six or seven times, and grammar is what unblocks it: the
 * gate opens for the right sentence, the planks land in the right order, the
 * correct fork lights up and she walks on. Getting it wrong costs a moment
 * and a hint, never a mark — nothing here is recorded, nothing counts, and
 * the API has no write path for it at all.
 *
 * What she is asked comes entirely from the teacher: published questions from
 * this unit, presented by the same engine the activity uses, marked on the
 * server. This file knows how to draw a journey and how to take a tap. It
 * does not know one word of anybody's curriculum.
 */

/** Where each world's road leads. Presentation: the API sends no wording. */
const DESTINATION: Record<SceneKind, { where: string; goal: string }> = {
  meadow: { where: 'the big oak', goal: 'Reach the big oak at the top of the meadow' },
  town: { where: 'the library', goal: 'Reach the library on the other side of town' },
  sky: { where: 'the top of the hill', goal: 'Fly your kite from the top of the hill' },
  city: { where: 'the school gates', goal: 'Reach the school gates across the city' },
  journal: { where: 'the last page', goal: 'Write your way to the last page' },
};

/** What each obstacle says for itself, before the question is read. */
const OBSTACLE_LINE: Record<AdventureCheckpoint['kind'], string> = {
  path: 'The road splits. Which way is written correctly?',
  bridge: 'The bridge is out. Lay the planks in the right order.',
  gate: 'The gate is locked. Which sentence is the key?',
  signpost: 'Is this sign telling the truth?',
  backpack: 'Pack the right word before you go on.',
  final: 'One last challenge, and you are there.',
};

/** Never "wrong". She tried something and it did not open. */
const NUDGE = ['Almost! Try again.', 'Good try — have another look.', 'Not quite. One more go!'];

type Phase = 'intro' | 'asking' | 'wrong' | 'moving' | 'arrived';

interface Option {
  id: string;
  text: string;
}

function optionsOf(checkpoint: AdventureCheckpoint): Option[] {
  const raw = checkpoint.payload.options;
  return Array.isArray(raw) ? (raw as Option[]) : [];
}

function tokensOf(checkpoint: AdventureCheckpoint): Option[] {
  const raw = checkpoint.payload.tokens;
  return Array.isArray(raw) ? (raw as Option[]) : [];
}

export function GrammarAdventure({
  unitId,
  scene,
  onLeave,
}: {
  unitId: string;
  /** The unit's own world, so the journey happens somewhere she knows. */
  scene: SceneKind;
  onLeave: () => void;
}) {
  const [round, setRound] = useState<AdventureRound | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [hint, setHint] = useState<string | null>(null);
  const [nudge, setNudge] = useState(NUDGE[0]);
  const [tries, setTries] = useState(0);
  /** Planks laid so far on a bridge, as token ids in the order she tapped. */
  const [laid, setLaid] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const walkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      const next = await api.get<AdventureRound>(`/learn/units/${unitId}/adventure`);
      setRound(next);
      setAt(0);
      setPhase('intro');
      setHint(null);
      setLaid([]);
      setTries(0);
    } catch (caught) {
      setProblem(
        caught instanceof ApiError
          ? caught.message
          : 'The adventure could not be loaded. Try again in a moment.',
      );
    }
  }, [unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => {
    if (walkTimer.current) clearTimeout(walkTimer.current);
  }, []);

  const checkpoint = round?.checkpoints[at] ?? null;
  const total = round?.checkpoints.length ?? 0;
  const destination = DESTINATION[scene];

  const tokens = useMemo(() => (checkpoint ? tokensOf(checkpoint) : []), [checkpoint]);

  /**
   * Where she stands on the road.
   *
   * The obstacle always stands in the middle of the stage, so she has to stay
   * short of it — otherwise she is drawn on top of the bridge she has not
   * crossed. She creeps rightward as checkpoints fall, steps up to the
   * obstacle as it opens, and ends up at the destination itself.
   */
  const along =
    phase === 'arrived'
      ? 0.42
      : phase === 'moving'
        ? 0.24
        : total === 0
          ? 0.02
          : 0.02 + (at / total) * 0.1;

  async function send(response: Record<string, unknown>) {
    if (!checkpoint || busy) return;
    setBusy(true);
    try {
      const verdict = await api.post<AdventureAnswer>(`/learn/units/${unitId}/adventure/answer`, {
        questionId: checkpoint.questionId,
        response,
      });
      if (verdict.correct) {
        // The world opens, she walks, and only then is the next one asked.
        setPhase('moving');
        setHint(null);
        walkTimer.current = setTimeout(() => {
          if (at + 1 >= total) {
            setPhase('arrived');
          } else {
            setAt((n) => n + 1);
            setLaid([]);
            setTries(0);
            setPhase('asking');
          }
        }, 1100);
      } else {
        setTries((n) => n + 1);
        setNudge(NUDGE[(tries + 1) % NUDGE.length]);
        setHint(verdict.hint);
        setLaid([]);
        setPhase('wrong');
      }
    } catch (caught) {
      setProblem(caught instanceof ApiError ? caught.message : 'That could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  /** A plank goes down. When the last one lands, the bridge is tested. */
  function layPlank(id: string) {
    if (phase === 'moving' || busy) return;
    const next = [...laid, id];
    setLaid(next);
    setPhase('asking');
    setHint(null);
    if (next.length === tokens.length) void send({ order: next });
  }

  if (problem) {
    return (
      <div className="card stack" data-testid="adventure-problem">
        <p className="alert warn" style={{ margin: 0 }}>
          {problem}
        </p>
        <div className="row">
          <button className="primary" onClick={() => void load()}>
            Try again
          </button>
          <button onClick={onLeave}>Back to games</button>
        </div>
      </div>
    );
  }

  if (!round || !checkpoint) {
    return <div className="skeleton" style={{ height: '20rem', borderRadius: 'var(--r-xl)' }} />;
  }

  const opened = phase === 'moving' || phase === 'arrived';
  const options = optionsOf(checkpoint);

  return (
    <div className="adv" data-testid="adventure">
      {/* --- what she is trying to do, and how far along she is ---------- */}
      <div className="adv-head">
        <div>
          <p className="adv-goal" data-testid="adventure-goal">
            {destination.goal}
          </p>
          <p className="adv-where">
            {phase === 'arrived'
              ? `You made it to ${destination.where}!`
              : `Checkpoint ${at + 1} of ${total}`}
          </p>
        </div>
        <ol className="adv-pips" aria-label={`Checkpoint ${at + 1} of ${total}`}>
          {round.checkpoints.map((c, n) => (
            <li
              key={c.questionId}
              data-state={n < at || phase === 'arrived' ? 'done' : n === at ? 'here' : 'ahead'}
            />
          ))}
        </ol>
      </div>

      {/* --- the world ---------------------------------------------------- */}
      <div
        className="adv-stage"
        data-phase={phase}
        /* Which obstacle is standing here — read by the stage's own styles and
           by QA, which has to prove the journey really does vary. */
        data-obstacle={phase === 'arrived' ? 'final' : checkpoint.kind}
        data-testid="adventure-stage"
      >
        <Scene kind={scene} className="adv-scene" fit="fill" />
        <svg className="adv-play" viewBox="0 0 320 180" aria-hidden="true">
          {/* the road she is walking */}
          <path
            d="M-10 158c60-8 110-10 150-6s90 8 190 2"
            stroke="var(--w2)"
            strokeWidth="18"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M-10 158c60-8 110-10 150-6s90 8 190 2"
            stroke="#fff"
            strokeWidth="3"
            strokeDasharray="8 12"
            fill="none"
            opacity=".65"
          />
          {phase !== 'arrived' && (
            <Obstacle
              kind={checkpoint.kind}
              open={opened}
              laid={laid.length}
              total={tokens.length}
              scene={scene}
            />
          )}
          {phase === 'arrived' && <Obstacle kind="final" open scene={scene} />}
        </svg>
        {/* she stands on the road, and moves along it as checkpoints fall */}
        <div
          className="adv-walker"
          style={{ ['--along' as string]: `${along * 100}%` }}
          data-walking={phase === 'moving'}
        >
          <Girl
            who="maya"
            pose={phase === 'arrived' ? 'cheer' : phase === 'wrong' ? 'think' : 'walk'}
            mood={phase === 'arrived' ? 'bright' : phase === 'wrong' ? 'thinking' : 'happy'}
          />
        </div>
        {phase === 'arrived' && (
          <div className="adv-party" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 5) * 110}ms` }} />
            ))}
          </div>
        )}
      </div>

      {/* --- the challenge ------------------------------------------------ */}
      {phase === 'arrived' ? (
        <div className="adv-ask adv-done" data-testid="adventure-done">
          <strong className="adv-win">You did it!</strong>
          <p className="adv-line">
            You opened every gate on the way to {destination.where}. That was all your own
            grammar.
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="primary" onClick={() => void load()} data-testid="adventure-again">
              <Icon name="play" size={16} />
              Go again
            </button>
            <button onClick={onLeave}>Back to games</button>
          </div>
        </div>
      ) : (
        <div className="adv-ask" data-testid="adventure-ask">
          <p className="adv-obstacle">{OBSTACLE_LINE[checkpoint.kind]}</p>
          <p className="adv-prompt" data-testid="adventure-prompt">
            {checkpoint.prompt}
          </p>

          {/* A bridge: tap the words in order, and each one is a plank. */}
          {checkpoint.typeKey === 'word_ordering' ? (
            <>
              <div className="adv-laid" aria-label="The planks you have laid">
                {laid.length === 0 ? (
                  <span className="adv-laid-empty">Tap the words in order.</span>
                ) : (
                  laid.map((id) => (
                    <span key={id} className="adv-plank">
                      {tokens.find((t) => t.id === id)?.text ?? ''}
                    </span>
                  ))
                )}
              </div>
              <div className="adv-choices">
                {tokens
                  .filter((t) => !laid.includes(t.id))
                  .map((token) => (
                    <button
                      key={token.id}
                      className="adv-choice adv-token"
                      disabled={busy || phase === 'moving'}
                      onClick={() => layPlank(token.id)}
                      data-testid="adventure-token"
                    >
                      {token.text}
                    </button>
                  ))}
              </div>
              {laid.length > 0 && (
                <button
                  className="small"
                  onClick={() => setLaid([])}
                  disabled={busy}
                  data-testid="adventure-clear"
                >
                  Take the planks back
                </button>
              )}
            </>
          ) : checkpoint.typeKey === 'true_false' ? (
            /* A sign: does it tell the truth? */
            <div className="adv-choices adv-two">
              <button
                className="adv-choice"
                disabled={busy || phase === 'moving'}
                onClick={() => void send({ value: true })}
                data-testid="adventure-true"
              >
                <Icon name="tick" size={18} />
                Yes, that is right
              </button>
              <button
                className="adv-choice"
                disabled={busy || phase === 'moving'}
                onClick={() => void send({ value: false })}
                data-testid="adventure-false"
              >
                <Icon name="cross" size={18} />
                No, that is wrong
              </button>
            </div>
          ) : (
            /* A fork, a gate, a bag: one of these is the way on. */
            <div className={`adv-choices${options.length === 2 ? ' adv-two' : ''}`}>
              {options.map((option, n) => (
                <button
                  key={option.id}
                  className="adv-choice"
                  disabled={busy || phase === 'moving'}
                  onClick={() => void send({ optionId: option.id })}
                  data-testid="adventure-option"
                >
                  {checkpoint.kind === 'path' && (
                    <span className="adv-mark" aria-hidden="true">
                      {String.fromCharCode(65 + n)}
                    </span>
                  )}
                  {option.text}
                </button>
              ))}
            </div>
          )}

          {/* A wrong turn: never a red screen, never a score. */}
          {phase === 'wrong' && (
            <div className="adv-nudge" role="status" data-testid="adventure-nudge">
              <Girl who="nour" pose="think" mood="thinking" className="girl adv-helper" />
              <div>
                <strong>{nudge}</strong>
                {hint && <p data-testid="adventure-hint">{hint}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
