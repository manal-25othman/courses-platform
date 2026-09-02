'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, BonusGame, BonusGameRound } from '@/lib/api';
import { Icon } from './Icon';

/**
 * Bonus review games.
 *
 * These are for practice and enjoyment and count for nothing. That is said on
 * the screen as well as being true underneath: nothing here posts anything,
 * and the API has no way to record a round even if it wanted to.
 *
 * Everything is a button rather than a drag, so it works the same with a
 * finger as with a mouse.
 */
export function BonusGames({ unitId }: { unitId: string }) {
  const [games, setGames] = useState<BonusGame[] | null>(null);
  const [playing, setPlaying] = useState<BonusGameRound | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGames(await api.get<BonusGame[]>(`/learn/units/${unitId}/games`));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Games could not be loaded.');
    }
  }, [unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function start(key: string) {
    setError(null);
    try {
      setPlaying(await api.get<BonusGameRound>(`/learn/units/${unitId}/games/${key}`));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That game could not be started.');
    }
  }

  if (!games) {
    return (
      <div className="game-shelf">
        <div className="skeleton" style={{ height: '11rem' }} />
        <div className="skeleton" style={{ height: '11rem' }} />
      </div>
    );
  }

  if (playing) {
    const name = playing.gameKey === 'memory_match' ? 'Memory Match' : 'Quick Match';
    return (
      <div className="stack" data-kind="games">
        <div className="between">
          <h2 className="marked-title" style={{ margin: 0 }}>{name}</h2>
          <button className="ghost small" onClick={() => setPlaying(null)} data-testid="game-exit">
            <Icon name="back" />
            All games
          </button>
        </div>
        {playing.gameKey === 'memory_match' ? (
          <MemoryMatch round={playing} onAgain={() => start('memory_match')} />
        ) : (
          <QuickMatch round={playing} onAgain={() => start('quick_match')} />
        )}
      </div>
    );
  }

  return (
    <div className="stack" data-kind="games">
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      <div className="game-shelf">
        {games.map((game) => (
          <button
            key={game.key}
            className="game-card"
            data-kind={game.key === 'memory_match' ? 'games' : 'activity'}
            disabled={!game.available}
            onClick={() => start(game.key)}
            data-testid={`game-${game.key}`}
          >
            <span className="game-icon" aria-hidden="true">
              <Icon name={game.key === 'memory_match' ? 'games' : 'star'} size={22} />
            </span>
            <span className="game-name">{game.displayName}</span>
            <span className="game-why">{game.description}</span>
            {game.available ? (
              <span className="row" style={{ color: 'var(--kind-ink)', fontWeight: 700, fontSize: 'var(--fs-small)' }}>
                <Icon name="play" size={14} />
                Play with {game.itemCount} words
              </span>
            ) : (
              /* Why it is closed, in the terms she can act on: more words. */
              <span className="game-why">
                Opens at {game.minimumItems} words. This unit has {game.itemCount}.
              </span>
            )}
          </button>
        ))}
      </div>

      {/*
        Said once, at the bottom, where it reassures rather than warns. It is
        true all the way down: this component posts nothing and the API has no
        write path for a game.
      */}
      <p className="round-note" data-testid="games-note" style={{ maxWidth: 'none' }}>
        Nothing here is marked. Playing does not change your progress or your score.
      </p>
    </div>
  );
}

/** Turn over two cards and see whether the word and the meaning belong together. */
function MemoryMatch({ round, onAgain }: { round: BonusGameRound; onAgain: () => void }) {
  type Card = { key: string; pairId: string; face: string; rtl: boolean };

  const [cards] = useState<Card[]>(() => {
    const built = round.pairs.flatMap((p) => [
      { key: `${p.id}-en`, pairId: p.id, face: p.wordEn, rtl: false },
      { key: `${p.id}-ar`, pairId: p.id, face: p.meaningAr, rtl: true },
    ]);
    // Laid out once, when the board is built. Reshuffling on every render
    // would move the cards while she is looking at them.
    for (let i = built.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [built[i], built[j]] = [built[j], built[i]];
    }
    return built;
  });

  const [turned, setTurned] = useState<string[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [tries, setTries] = useState(0);

  function turn(card: Card) {
    if (found.includes(card.pairId) || turned.includes(card.key) || turned.length === 2) return;

    const next = [...turned, card.key];
    setTurned(next);

    if (next.length === 2) {
      setTries((n) => n + 1);
      const [a, b] = next.map((k) => cards.find((c) => c.key === k)!);
      if (a.pairId === b.pairId) {
        setFound((f) => [...f, a.pairId]);
        setTurned([]);
      } else {
        // Long enough to read both, short enough not to feel stuck.
        setTimeout(() => setTurned([]), 900);
      }
    }
  }

  const done = found.length === round.pairs.length;

  if (done) {
    return (
      <div className="round-end" data-testid="game-done">
        <span className="mark tick" style={{ width: '3.5rem', height: '3.5rem' }}>
          <Icon name="tick" size={26} />
        </span>
        <span className="round-score">{tries}</span>
        <strong style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-title)' }}>
          {tries === round.pairs.length ? 'Perfect — every pair first time.' : `All ${round.pairs.length} pairs found.`}
        </strong>
        <p className="round-note">
          {tries === 1 ? '1 try.' : `${tries} tries.`} Nothing was recorded — this was just practice.
        </p>
        <button className="primary" onClick={onAgain}>
          Play again
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      {/* Both numbers are real: pairs found is state, tries is counted here. */}
      <div className="play-head">
        <span className="play-stat">
          <b>{found.length}<span style={{ color: 'var(--ink-4)' }}>/{round.pairs.length}</span></b>
          <span>pairs found</span>
        </span>
        <span className="play-stat">
          <b>{tries}</b>
          <span>{tries === 1 ? 'try' : 'tries'}</span>
        </span>
        <span style={{ flex: 1 }} />
        <span className="tally" aria-hidden="true">
          {round.pairs.map((p) => (
            <i key={p.id} data-on={found.includes(p.id)} />
          ))}
        </span>
      </div>

      <div className="memory-board">
        {cards.map((card) => {
          const matched = found.includes(card.pairId);
          const open = turned.includes(card.key) || matched;
          return (
            <button
              key={card.key}
              className={`memory-card${open ? ' open' : ''}${matched ? ' done' : ''}`}
              onClick={() => turn(card)}
              dir={card.rtl ? 'rtl' : 'ltr'}
              lang={card.rtl ? 'ar' : 'en'}
              aria-label={open ? card.face : 'Hidden card'}
              data-testid="memory-card"
            >
              {open ? card.face : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Pick the right meaning for the word. */
function QuickMatch({ round, onAgain }: { round: BonusGameRound; onAgain: () => void }) {
  const [at, setAt] = useState(0);
  const [right, setRight] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);

  const question = round.questions[at];
  const finished = at >= round.questions.length;

  function choose(option: string) {
    if (chosen) return;
    setChosen(option);
    if (option === question.answer) setRight((n) => n + 1);
    setTimeout(() => {
      setChosen(null);
      setAt((n) => n + 1);
    }, 800);
  }

  if (finished) {
    const perfect = right === round.questions.length;
    return (
      <div className="round-end" data-testid="game-done">
        <span className={`mark ${perfect ? 'tick' : 'cross'}`} style={{ width: '3.5rem', height: '3.5rem' }}>
          <Icon name={perfect ? 'tick' : 'star'} size={26} />
        </span>
        <span className="round-score">
          {right}<span style={{ color: 'var(--ink-4)' }}>/{round.questions.length}</span>
        </span>
        <strong style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-title)' }}>
          {perfect ? 'Every one right.' : right === 0 ? 'Worth another go.' : 'Nicely done.'}
        </strong>
        <p className="round-note">Nothing was recorded — this was just practice.</p>
        <button className="primary" onClick={onAgain}>
          Play again
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="play-head">
        <span className="play-stat">
          <b>{at + 1}<span style={{ color: 'var(--ink-4)' }}>/{round.questions.length}</span></b>
          <span>word</span>
        </span>
        <span className="play-stat">
          <b>{right}</b>
          <span>right so far</span>
        </span>
        <span style={{ flex: 1 }} />
        <span className="tally" aria-hidden="true">
          {round.questions.map((_, n) => (
            <i key={n} data-on={n < at} />
          ))}
        </span>
      </div>

      {/* The word is the question, so it gets the screen. */}
      <p className="quick-word">{question.wordEn}</p>

      <div className="choices">
        {question.options.map((option) => {
          const state =
            chosen === null
              ? ''
              : option === question.answer
                ? ' right'
                : option === chosen
                  ? ' wrong'
                  : '';
          return (
            <button
              key={option}
              className={`choice${state}`}
              onClick={() => choose(option)}
              disabled={chosen !== null}
              dir="rtl"
              lang="ar"
              data-testid="quick-option"
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
