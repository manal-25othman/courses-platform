'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, BonusGame, LearnUnitSummary, Me, homeFor } from '@/lib/api';
import { StudentNav, TopBar } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Glyph } from '@/components/world/Scene';
import { WorldGround } from '@/components/world/WorldGround';
import { themeFor, themeVars } from '@/lib/world';

import { BonusGames } from '@/components/BonusGames';

/**
 * Names in a row, the way they are said aloud: "A", "A and B", "A, B and C".
 * Joining every name with "and" reads as a stammer once a third game exists.
 */
function listOf(names: string[]): string {
  if (names.length < 3) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Games, gathered in one place.
 *
 * They live off the course on purpose. Nothing here is marked and nothing
 * counts, which is exactly why a student will play them — and why the page
 * says so once, plainly, instead of hiding it.
 */
export default function GamesPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [units, setUnits] = useState<LearnUnitSummary[] | null>(null);
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, BonusGame[]>>({});

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
    api
      .get<LearnUnitSummary[]>('/learn/units')
      .then(async (list) => {
        setUnits(list);
        // Which units actually have enough words to play with.
        const found: Record<string, BonusGame[]> = {};
        for (const unit of list) {
          try {
            found[unit.id] = await api.get<BonusGame[]>(`/learn/units/${unit.id}/games`);
          } catch {
            found[unit.id] = [];
          }
        }
        setCounts(found);
      })
      .catch(() => setUnits([]));
  }, [me]);

  if (!me || units === null) {
    return (
      <>
        <TopBar nav />
        <main className="page has-navbar">
          <div className="skeleton" style={{ height: '2rem', width: '9rem' }} />
          <div className="skeleton" style={{ height: '7rem', marginTop: '1.5rem' }} />
        </main>
      </>
    );
  }

  if (openUnit) {
    const unit = units.find((u) => u.id === openUnit);
    return (
      <>
        <TopBar nav />
        <WorldGround />
        <main
          className="page has-navbar stack world"
          data-kind="games"
          style={unit ? themeVars(themeFor(unit.title, unit.progress.countsTowardCompletion, units.indexOf(unit))) : undefined}
        >
          <button className="ghost small" onClick={() => setOpenUnit(null)} data-testid="all-units">
            <Icon name="back" />
            All units
          </button>
          <h1>{unit?.title}</h1>
          <BonusGames
            unitId={openUnit}
            scene={
              unit
                ? themeFor(unit.title, unit.progress.countsTowardCompletion, units.indexOf(unit)).scene
                : 'journal'
            }
          />
        </main>
        <StudentNav />
      </>
    );
  }

  const playable = units.filter((u) => (counts[u.id] ?? []).some((g) => g.available));
  /*
    Which units she could still open games in. Two things disqualify a unit:
    having no words at all (there is nothing to learn towards yet — Grammar
    Review is the case here), and not being part of the course. Naming those
    would promise something that will never happen.
  */
  const notYet = units.filter(
    (u) =>
      u.progress.countsTowardCompletion &&
      !(counts[u.id] ?? []).some((g) => g.available) &&
      (counts[u.id] ?? []).some((g) => g.itemCount > 0),
  );

  return (
    <>
      <TopBar nav />
      <WorldGround />
      <main className="page has-navbar stack world" data-kind="games">
        <header className="greeting">
          <h1>Games</h1>
          <p className="greeting-line">
            Play with the words and the grammar you have already met. Nothing here is marked,
            and none of it changes your progress.
          </p>
        </header>

        {playable.length === 0 ? (
          <div className="locked-note">
            <Icon name="games" />
            <div>
              <strong>Games open once a unit has enough to play with</strong>
              <p className="muted" style={{ margin: '.25rem 0 0' }}>
                Memory Match needs six words with meanings, Quick Match needs four, and Grammar
                Adventure needs three grammar questions. Learn a few more and come back.
              </p>
            </div>
          </div>
        ) : (
          <div className="game-shelf">
            {playable.map((unit) => {
              const ready = (counts[unit.id] ?? []).filter((g) => g.available);
              return (
                <button
                  key={unit.id}
                  className="game-card"
                  data-kind="games"
                  style={themeVars(themeFor(unit.title, unit.progress.countsTowardCompletion, units.indexOf(unit)))}
                  onClick={() => setOpenUnit(unit.id)}
                  data-testid="games-unit"
                >
                  <span className="game-icon" aria-hidden="true">
                    <Glyph kind={themeFor(unit.title, unit.progress.countsTowardCompletion, units.indexOf(unit)).scene} />
                  </span>
                  <span className="game-name">{unit.title}</span>
                  {/* Named, not counted: "2 games ready" says less than
                      "Memory Match, Quick Match" and takes the same room. */}
                  <span className="game-why">{listOf(ready.map((g) => g.displayName))}</span>
                </button>
              );
            })}
          </div>
        )}

        {/*
          Units that have words but not enough of them. Saying so is the only
          way she can tell the difference between "not built yet" and "keep
          going" — and the second one she can do something about.
        */}
        {playable.length > 0 && notYet.length > 0 && (
          <p className="round-note" style={{ maxWidth: 'none', textAlign: 'left' }}>
            More games open as you learn the words in{' '}
            {notYet.map((u) => u.title).join(', ')}.
          </p>
        )}
      </main>
      <StudentNav />
    </>
  );
}
