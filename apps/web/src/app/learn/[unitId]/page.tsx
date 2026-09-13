'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  homeFor,
  LearnUnit,
  Me,
  UnitProgress,
} from '@/lib/api';
import { VocabularyCards } from '@/components/VocabularyCards';
import { GrammarSections } from '@/components/GrammarSections';
import { ActivityRunner } from '@/components/ActivityRunner';
import { BonusGames } from '@/components/BonusGames';
import { StudentNav, TopBar } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { UnitJourney } from '@/components/UnitJourney';
import { Scene, Glyph } from '@/components/world/Scene';
import { Girl } from '@/components/world/Girl';
import { WorldGround } from '@/components/world/WorldGround';
import { themeFor, themeVars } from '@/lib/world';

type Tab = 'vocabulary' | 'grammar' | 'activity' | 'assessment' | 'games';

/** What to call each part when telling her it is missing. */
const MISSING_LABELS: Record<string, string> = {
  vocabulary: 'words',
  grammar: 'grammar',
  activity: 'activity',
  assessment: 'assessment',
};

/**
 * One unit, as a student works through it.
 *
 * Four parts, in the order the curriculum teaches them: learn the words, read
 * the explanations, practise with the questions, then sit the unit's
 * assessment. Which tab is open is the only thing this page decides;
 * everything shown inside comes from the API, which serves published material
 * only, and every rule about the assessment is the API's.
 */
export default function LearnUnitPage() {
  const router = useRouter();
  const params = useParams<{ unitId: string }>();
  const unitId = params.unitId;

  const [me, setMe] = useState<Me | null>(null);
  const [unit, setUnit] = useState<LearnUnit | null>(null);
  const [progress, setProgress] = useState<UnitProgress | null>(null);
  const [tab, setTab] = useState<Tab>('vocabulary');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, unitProgress] = await Promise.all([
        api.get<LearnUnit>(`/learn/units/${unitId}`),
        api.get<UnitProgress>(`/learn/units/${unitId}/progress`),
      ]);
      setUnit(detail);
      setProgress(unitProgress);
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.push('/login');
        return;
      }
      setError(
        caught instanceof ApiError ? caught.message : 'Could not open this unit.',
      );
    }
  }, [unitId, router]);

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
    if (me) void load();
  }, [me, load]);

  if (!me || (!unit && !error)) {
    return (
      <main className="page">
        <div className="skeleton" style={{ height: '2rem', width: '11rem' }} />
        <div className="skeleton" style={{ height: '.5rem', marginTop: '1rem' }} />
        <div className="skeleton" style={{ height: '2.5rem', marginTop: '1.5rem' }} />
        <div className="skeleton" style={{ height: '14rem', marginTop: '1rem' }} />
      </main>
    );
  }

  if (!unit) {
    return (
      <>
        <TopBar nav />
        <main className="page stack">
          <p className="alert error" role="alert">
            {error ?? 'That unit could not be opened.'}
          </p>
          <button className="primary" onClick={() => router.push('/home')}>
            Back to my course
          </button>
        </main>
      </>
    );
  }

  // The grammar the teacher has approved. The API sends nothing else: her
  // flow is Words, Grammar, Activity.
  const grammarSections = unit.sections;

  /**
   * The API decides what is open; this only draws it.
   *
   * Disabling a tab is a courtesy, not the rule — the same conditions are
   * enforced on every call the tab would make, so typing the address or
   * calling the API directly is refused with the same reason.
   *
   * A locked tab must never also be the open one: if she is standing on a tab
   * that has just locked (she reset her progress, or a teacher published more
   * words), she is moved back to what she can actually do.
   */
  const grammarLocked = progress?.grammarLock.locked ?? false;
  const assessmentLockReason =
    unit.assessment.blockedBecause === 'vocabulary_incomplete' ||
    unit.assessment.blockedBecause === 'grammar_incomplete'
      ? unit.assessment.blockedBecause
      : null;
  const assessmentLocked = assessmentLockReason !== null;

  const activeTab: Tab =
    (tab === 'grammar' && grammarLocked) || (tab === 'assessment' && assessmentLocked)
      ? 'vocabulary'
      : tab;

  const kindOf: Record<Tab, string> = {
    vocabulary: 'vocabulary', grammar: 'grammar', activity: 'activity',
    assessment: 'assessment', games: 'games',
  };

  // Where this unit lives, from its title; the extras live in the journal.
  const theme = themeFor(unit.title, progress?.countsTowardCompletion ?? true);
  const PLACE: Record<typeof theme.scene, string> = {
    meadow: 'In the meadow', town: 'Around town', sky: 'Up in the sky',
    city: 'In the city', journal: 'From your journal',
  };
  // How many of the four parts are behind her, for "One more step!".
  const partsDone = progress
    ? [progress.vocabulary, progress.grammar, progress.activity].filter(
        (part) => !part.empty && part.percent === 100,
      ).length + (progress.assessmentState.passed ? 1 : 0)
    : 0;

  return (
    <>
      <TopBar
        nav
        right={
          <button className="ghost small" onClick={() => router.push('/home')}>
            <Icon name="back" />
            <span className="hide-sm">My course</span>
          </button>
        }
      />

      <WorldGround />
      <main
        className="page has-navbar stack world"
        data-kind={kindOf[activeTab]}
        style={themeVars(theme)}
      >
        {/* The unit's banner: its place, its name, and how far along she is. */}
        <header className="unit-banner">
          <Scene kind={theme.scene} />
          <Girl
            who="maya"
            pose={progress?.assessmentState.passed ? 'cheer' : 'walk'}
            mood={progress?.assessmentState.passed ? 'bright' : 'happy'}
            className="girl banner-girl"
          />
          <span className="unit-place">
            <Glyph kind={theme.scene} size={16} />
            {PLACE[theme.scene]}
          </span>
          <h1>{unit.title}</h1>
          {progress && (
            <p
              className={progress.assessmentState.passed ? 'finished-ribbon' : 'muted'}
              data-testid="unit-progress"
              style={{ margin: 0 }}
            >
              {progress.assessmentState.passed && <Icon name="star" size={14} />}
              {progress.assessmentState.passed
                ? 'Unit complete! You passed the test.'
                : partsDone === 3
                  ? `One more step! ${progress.overallPercent}% done.`
                  : `${progress.overallPercent}% of this unit done`}
            </p>
          )}
          {progress && (
            <div
              className="meter"
              data-done={progress.overallPercent === 100}
              aria-label={`${progress.overallPercent} percent done`}
            >
              <span style={{ width: `${progress.overallPercent}%` }} />
            </div>
          )}
        </header>

        {progress && !progress.countsTowardCompletion && (
          <p className="muted" style={{ margin: 0 }} data-testid="not-counted-unit">
            Extra practice. This one does not change your course progress.
          </p>
        )}

        {/*
          A part with nothing in it holds the unit below 100%. Naming the part
          is the difference between "you have not finished" and "there is
          nothing here to finish" — she can stop looking for work that does not
          exist yet.
        */}
        {progress && progress.missingContent.length > 0 && (
          <p className="alert warn" data-testid="missing-content">
            Your teacher is still adding the{' '}
            {progress.missingContent.map((part) => MISSING_LABELS[part] ?? part).join(' and ')} for
            this unit, so it cannot reach 100% yet.
          </p>
        )}

        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}

        {/*
          The road through the unit is the navigation. Games sit beside it,
          not on it: a game is never a step and never locks anything.
        */}
        <div className="unit-journey">
          <UnitJourney
            active={activeTab}
            progress={progress}
            onPick={setTab}
            stops={[
              { key: 'vocabulary', label: 'Words', count: unit.vocabulary.length, locked: false },
              { key: 'grammar', label: 'Grammar', count: grammarSections.length, locked: grammarLocked },
              { key: 'activity', label: 'Activity', locked: false },
              { key: 'assessment', label: 'Test', locked: assessmentLocked },
            ]}
          />
          <div className="tabs unit-extra" role="tablist" aria-label="Extra">
            <button
              role="tab"
              aria-selected={activeTab === 'games'}
              onClick={() => setTab('games')}
              data-kind="games"
              data-testid="tab-games"
            >
              <Icon name="games" size={16} />
              Games
            </button>
          </div>
        </div>

        {activeTab === 'vocabulary' && (
          <VocabularyCards words={unit.vocabulary} onChanged={load} scene={theme.scene} />
        )}

        {activeTab === 'grammar' && (
          <GrammarSections sections={grammarSections} onChanged={load} />
        )}

        {activeTab === 'activity' && (
          <ActivityRunner
            unitId={unit.id}
            questionCount={unit.activity.questionCount}
            onFinished={load}
          />
        )}

        {activeTab === 'games' && (
          <>
            {/*
              Never locked and never locking. A game is not a step in the
              sequence: it cannot be required, and playing one changes nothing.
            */}
            <BonusGames unitId={unitId} scene={theme.scene} />
          </>
        )}

        {activeTab === 'assessment' && (
          <ActivityRunner
            unitId={unit.id}
            mode="assessment"
            questionCount={unit.assessment.questionCount}
            assessment={unit.assessment}
            onFinished={load}
          />
        )}
      </main>

      <StudentNav />
    </>
  );
}
