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

type Tab = 'vocabulary' | 'grammar' | 'activity' | 'assessment';

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
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (!unit) {
    return (
      <main className="page stack">
        <p className="alert error" role="alert">
          {error}
        </p>
        <button onClick={() => router.push('/home')}>Back to my units</button>
      </main>
    );
  }

  // The grammar the teacher has approved. The API sends nothing else: her
  // flow is Words, Grammar, Activity.
  const grammarSections = unit.sections;

  return (
    <main className="page stack">
      <div className="between">
        <div>
          <h1>{unit.title}</h1>
          {progress && (
            <p className="muted" data-testid="unit-progress">
              {progress.overallPercent}% done · words {progress.vocabulary.done}/
              {progress.vocabulary.total}
              {progress.bestScorePercent !== null && ` · best score ${progress.bestScorePercent}%`}
              {progress.assessmentState.passed && ' · assessment passed'}
            </p>
          )}
          {progress && !progress.countsTowardCompletion && (
            <p className="muted" style={{ margin: 0 }} data-testid="not-counted-unit">
              This unit is extra practice. It does not count towards your course.
            </p>
          )}
          {/*
            A part with nothing in it holds the unit below 100%. Saying which
            part is missing is the difference between "you have not finished"
            and "there is nothing here to finish" — she can stop looking for
            work that does not exist yet.
          */}
          {progress && progress.missingContent.length > 0 && (
            <p className="muted" style={{ margin: 0 }} data-testid="missing-content">
              Your teacher has not added the{' '}
              {progress.missingContent
                .map((part) => MISSING_LABELS[part] ?? part)
                .join(', ')}{' '}
              for this unit yet, so it cannot be finished.
            </p>
          )}
        </div>
        <button onClick={() => router.push('/home')}>Back to my units</button>
      </div>

      {progress && (
        <div className="meter" aria-label={`${progress.overallPercent} percent done`}>
          <span style={{ width: `${progress.overallPercent}%` }} />
        </div>
      )}

      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'vocabulary'}
          onClick={() => setTab('vocabulary')}
          data-testid="tab-vocabulary"
        >
          Words ({unit.vocabulary.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === 'grammar'}
          onClick={() => setTab('grammar')}
          data-testid="tab-grammar"
        >
          Grammar ({grammarSections.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === 'activity'}
          onClick={() => setTab('activity')}
          data-testid="tab-activity"
        >
          Activity ({unit.activity.questionCount})
        </button>
        <button
          role="tab"
          aria-selected={tab === 'assessment'}
          onClick={() => setTab('assessment')}
          data-testid="tab-assessment"
        >
          Assessment{unit.assessment.passed ? ' ✓' : ` (${unit.assessment.questionCount})`}
        </button>
      </div>

      {tab === 'vocabulary' && (
        <VocabularyCards words={unit.vocabulary} onChanged={load} />
      )}

      {tab === 'grammar' && (
        <GrammarSections sections={grammarSections} onChanged={load} />
      )}

      {tab === 'activity' && (
        <ActivityRunner
          unitId={unit.id}
          questionCount={unit.activity.questionCount}
          onFinished={load}
        />
      )}

      {tab === 'assessment' && (
        <ActivityRunner
          unitId={unit.id}
          mode="assessment"
          questionCount={unit.assessment.questionCount}
          assessment={unit.assessment}
          onFinished={load}
        />
      )}
    </main>
  );
}
