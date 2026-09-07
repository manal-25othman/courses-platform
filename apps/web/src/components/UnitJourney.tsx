'use client';

import type { UnitProgress } from '@/lib/api';
import { Icon } from './Icon';

/**
 * The unit's four parts, drawn as the road through them.
 *
 * On Home the step track shows a student where she is in each unit; here the
 * same track *is* the navigation, so the picture and the controls are one
 * thing. Each node is still a real tab — same role, same selected state, same
 * lock — and the API alone decides what is open: this only draws it. A fifth
 * node, "Done", is not a tab at all; it is where the road goes, and it lights
 * up only when the server says the test is passed.
 */
export type JourneyTab = 'vocabulary' | 'grammar' | 'activity' | 'assessment';

export interface JourneyStop {
  key: JourneyTab;
  label: string;
  /** The count beside the label — words, sections — when there is one. */
  count?: number;
  /** The server refuses this part until something earlier is finished. */
  locked: boolean;
}

/** Done, being worked on, or still to come — read from her progress only. */
function stateOf(progress: UnitProgress | null, key: JourneyTab): 'done' | 'todo' | 'empty' {
  if (!progress) return 'todo';
  const part = progress[key];
  if (part.empty) return 'empty';
  if (key === 'assessment') return progress.assessmentState.passed ? 'done' : 'todo';
  return part.percent === 100 ? 'done' : 'todo';
}

export function UnitJourney({
  stops,
  active,
  progress,
  onPick,
}: {
  stops: JourneyStop[];
  active: JourneyTab | 'games';
  progress: UnitProgress | null;
  onPick: (tab: JourneyTab) => void;
}) {
  const states = stops.map((stop) => stateOf(progress, stop.key));
  // The road is inked up to the first part that is not finished.
  const finished = progress?.isComplete ?? false;

  return (
    <ol className="unit-track track" role="tablist" aria-label="Parts of this unit">
      {stops.map((stop, at) => {
        const state = states[at];
        const selected = active === stop.key;
        return (
          <li
            key={stop.key}
            className="track-step"
            data-kind={stop.key}
            data-state={stop.locked ? 'locked' : state}
            data-fill-before={at > 0 && states[at - 1] === 'done'}
            data-fill-after={state === 'done'}
          >
            <button
              className="track-tab"
              role="tab"
              aria-selected={selected}
              disabled={stop.locked}
              aria-disabled={stop.locked}
              onClick={() => onPick(stop.key)}
              data-testid={`tab-${stop.key}`}
            >
              <span className="track-node" aria-hidden="true">
                {stop.locked ? (
                  <Icon name="lock" size={14} />
                ) : state === 'done' ? (
                  <Icon name="tick" size={15} />
                ) : (
                  <Icon name={stop.key === 'vocabulary' ? 'words' : stop.key} size={15} />
                )}
              </span>
              <span className="track-label stroke" data-on={selected}>
                {stop.label}
                {stop.count !== undefined && stop.count > 0 && (
                  <span className="num"> {stop.count}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
      <li
        className="track-step track-end"
        data-kind="done"
        data-state={finished ? 'done' : 'todo'}
        data-fill-before={finished}
        aria-hidden="true"
      >
        <span className={`track-node${finished ? ' pop' : ''}`}>
          <Icon name="star" size={15} />
        </span>
        <span className="track-label">Done</span>
      </li>
    </ol>
  );
}
