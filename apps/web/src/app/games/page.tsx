'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, BonusGame, LearnUnitSummary, Me, homeFor } from '@/lib/api';
import { StudentNav, TopBar } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { BonusGames } from '@/components/BonusGames';

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
        <TopBar />
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
        <TopBar />
        <main className="page has-navbar stack" data-kind="games">
          <button className="ghost small" onClick={() => setOpenUnit(null)}>
            <Icon name="back" />
            All games
          </button>
          <h1>{unit?.title}</h1>
          <BonusGames unitId={openUnit} />
        </main>
        <StudentNav />
      </>
    );
  }

  const playable = units.filter((u) => (counts[u.id] ?? []).some((g) => g.available));

  return (
    <>
      <TopBar />
      <main className="page has-navbar stack" data-kind="games">
        <h1>Games</h1>
        <p className="muted" style={{ maxWidth: 'var(--read-max)' }}>
          Practice with the words you have already met. Nothing here is marked and none of it
          changes your progress — it is just for getting quicker.
        </p>

        {playable.length === 0 ? (
          <div className="card">
            <h2>No games yet</h2>
            <p className="muted" style={{ marginTop: '.5rem' }}>
              Games open up once a unit has enough words in it. Learn a few more and come back.
            </p>
          </div>
        ) : (
          <div className="cards">
            {playable.map((unit) => (
              <button
                key={unit.id}
                className="card"
                style={{ textAlign: 'left', borderTop: '3px solid var(--games)' }}
                onClick={() => setOpenUnit(unit.id)}
              >
                <span className="mark" style={{ background: 'var(--games-soft)', color: 'var(--games)' }}>
                  <Icon name="games" />
                </span>
                <strong style={{ display: 'block', marginTop: '.6rem', fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>
                  {unit.title}
                </strong>
                <span className="muted">
                  {(counts[unit.id] ?? []).filter((g) => g.available).length} games ready
                </span>
              </button>
            ))}
          </div>
        )}
      </main>
      <StudentNav />
    </>
  );
}
