'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, BonusGame, BonusGameRound } from '@/lib/api';

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

  if (!games) return <p className="muted">Loading games…</p>;

  if (playing) {
    return (
      <div>
        <div className="between" style={{ marginBottom: '.75rem' }}>
          <strong>{playing.gameKey === 'memory_match' ? 'Memory Match' : 'Quick Match'}</strong>
          <button className="small" onClick={() => setPlaying(null)} data-testid="game-exit">
            Back to games
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
    <div>
      <p className="alert ok" data-testid="games-note">
        These are just for fun and practice. Nothing here is marked, and it does not change
        your progress or your score.
      </p>

      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      <div className="cards">
        {games.map((game) => (
          <div key={game.key} className="card" data-testid={`game-${game.key}`}>
            <strong>{game.displayName}</strong>
            <p className="muted" style={{ margin: '.35rem 0' }}>
              {game.description}
            </p>
            {game.available ? (
              <button className="primary" onClick={() => start(game.key)}>
                Play
              </button>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Needs {game.minimumItems} words in this unit. It has {game.itemCount} so far.
              </p>
            )}
          </div>
        ))}
      </div>
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

  return (
    <div>
      <p className="muted">Tries: {tries}</p>

      {done ? (
        <div className="alert ok" data-testid="game-done">
          <p style={{ margin: 0 }}>All matched in {tries} tries. Nothing was recorded — it was
          just practice.</p>
          <button className="primary" style={{ marginTop: '.5rem' }} onClick={onAgain}>
            Play again
          </button>
        </div>
      ) : (
        <div className="memory-board">
          {cards.map((card) => {
            const open = turned.includes(card.key) || found.includes(card.pairId);
            return (
              <button
                key={card.key}
                className={`memory-card${open ? ' open' : ''}`}
                onClick={() => turn(card)}
                dir={card.rtl ? 'rtl' : 'ltr'}
                lang={card.rtl ? 'ar' : 'en'}
                aria-label={open ? card.face : 'Hidden card'}
                data-testid="memory-card"
              >
                {open ? card.face : '?'}
              </button>
            );
          })}
        </div>
      )}
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
    return (
      <div className="alert ok" data-testid="game-done">
        <p style={{ margin: 0 }}>
          {right} out of {round.questions.length}. Nothing was recorded — it was just practice.
        </p>
        <button className="primary" style={{ marginTop: '.5rem' }} onClick={onAgain}>
          Play again
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="muted">
        Word {at + 1} of {round.questions.length}
      </p>
      <p style={{ fontSize: '1.6rem', fontWeight: 600, margin: '.5rem 0 1rem' }}>
        {question.wordEn}
      </p>
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
