'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, ContentStatus, Me, UnitReview } from '@/lib/api';
import { Icon } from './Icon';

/**
 * One language for the life of a piece of curriculum, used everywhere a
 * teacher or an administrator meets it.
 *
 * Two different facts are kept apart on purpose:
 *
 *   CONTENT STATE      Draft | Published        — what the item's own row says
 *   STUDENT ACCESS     Visible | Not visible    — what a student actually gets
 *
 * They are not the same thing. A student sees an item only when the item is
 * Published AND its unit is Published AND (for a question) nothing about it
 * is still waiting for a teacher's check. So a word can be Published and
 * still invisible, because its unit is hidden — and the chip says so rather
 * than letting "Published" imply something that is not true.
 *
 * Who may do what mirrors the API's own rule (content.policy.ts): a teacher
 * publishes and hides; a school administrator prepares drafts. The screens
 * only echo that rule — the API enforces it.
 */
export function canPublish(me: Pick<Me, 'role'> | null): boolean {
  return me?.role === 'TEACHER';
}

/** Why a student cannot see something, or that she can. */
export function accessOf(
  item: { status: ContentStatus; needsReview?: boolean | null },
  unitOpen: boolean,
): { visible: boolean; word: string; why: string; tone: 'draft' | 'held' | 'blocked' | 'visible' } {
  if (item.status !== 'PUBLISHED') {
    return { visible: false, tone: 'draft', word: 'Draft', why: 'Not visible to students' };
  }
  if (item.needsReview) {
    return { visible: false, tone: 'held', word: 'Published', why: 'Held back until checked' };
  }
  if (!unitOpen) {
    return { visible: false, tone: 'blocked', word: 'Published', why: 'Not visible — unit is hidden' };
  }
  return { visible: true, tone: 'visible', word: 'Published', why: 'Visible to students' };
}

/** The two facts, side by side, on one item. */
export function ItemState({
  item,
  unitOpen,
  testId,
}: {
  item: { status: ContentStatus; needsReview?: boolean | null };
  unitOpen: boolean;
  testId?: string;
}) {
  const access = accessOf(item, unitOpen);
  return (
    <span className="state-chip" data-tone={access.tone} data-testid={testId}>
      <b>{access.word}</b>
      <span>{access.why}</span>
    </span>
  );
}

/** A unit's own gate, said as what it does to students. */
export function UnitState({ status }: { status: ContentStatus }) {
  const open = status === 'PUBLISHED';
  return (
    <span className="flag" data-tone={open ? 'quiet' : 'hidden'} data-testid="unit-access">
      <Icon name={open ? 'tick' : 'lock'} />
      {open ? 'Visible to students' : 'Hidden from students'}
    </span>
  );
}

/**
 * Publish or hide one item — a teacher's controls. An administrator gets the
 * reason instead of a button, so "why can't I?" is answered on the spot.
 */
export function ItemControls({
  me,
  item,
  publish,
  hide,
}: {
  me: Me;
  item: { status: ContentStatus; needsReview?: boolean | null };
  publish: () => void;
  hide: () => void;
}) {
  if (!canPublish(me)) return null;
  if (item.status === 'PUBLISHED') {
    return (
      <button className="small" onClick={hide} data-testid="hide-item">
        Hide
      </button>
    );
  }
  return (
    <button
      className="small"
      onClick={publish}
      disabled={Boolean(item.needsReview)}
      title={item.needsReview ? 'Check it first, then publish.' : undefined}
      data-testid="publish-item"
    >
      Publish
    </button>
  );
}

/**
 * What "Draft" means here, and what happens next — said once at the top of
 * the unit, in the words that are true for the person reading it.
 */
export function DraftNote({ me, unitOpen }: { me: Me; unitOpen: boolean }) {
  if (canPublish(me)) {
    return (
      <p className="lifecycle-note" data-testid="draft-note">
        <strong>Draft</strong> means saved and not visible to students. Publish an item to release
        it{unitOpen ? '.' : ' — and open the unit, or nothing in it is visible.'} Saving never
        publishes anything.
      </p>
    );
  }
  return (
    <p className="lifecycle-note" data-testid="draft-note">
      Everything you add or change here is <strong>saved as a draft</strong> and stays hidden from
      students. A teacher reviews drafts and publishes them; only a teacher can publish, hide or
      change published content.
    </p>
  );
}

/**
 * Review, then publish — the unit's one deliberate release.
 *
 * Reads what publishing would do before it is done: how many drafts of each
 * kind are ready, how many are held back for a check, how many are already
 * out. The held-back count is the point of the panel: those items are never
 * released by this button, however many times it is pressed.
 */
export function ReviewAndPublish({
  me,
  unitId,
  unitTitle,
  onDone,
  onError,
  onCancel,
}: {
  me: Me;
  unitId: string;
  unitTitle: string;
  onDone: (message: string) => Promise<void> | void;
  onError: (message: string) => void;
  onCancel: () => void;
}) {
  const [review, setReview] = useState<UnitReview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setReview(await api.get<UnitReview>(`/content/units/${unitId}/review`));
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'The review could not be loaded.');
    }
  }, [unitId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!review) {
    return (
      <div className="confirm" data-testid="unit-review">
        <p className="confirm-body">Counting what this unit holds…</p>
      </div>
    );
  }

  const rows: { label: string; tally: UnitReview['words'] }[] = [
    { label: 'Words', tally: review.words },
    { label: 'Grammar pages', tally: review.sections },
    { label: 'Activity questions', tally: review.activity },
    { label: 'Test questions', tally: review.assessment },
  ];
  const ready = rows.reduce((sum, r) => sum + r.tally.ready, 0);
  const held = rows.reduce((sum, r) => sum + r.tally.held, 0);
  const open = review.unitStatus === 'PUBLISHED';
  // Both the server's answer and the role in hand must agree; the server's
  // is the one that counts, and the button is only drawn when it says so.
  const mayPublish = review.canPublish && canPublish(me);

  async function publish() {
    setBusy(true);
    try {
      await api.post(`/content/units/${unitId}/publish`);
      await onDone(
        open
          ? `${ready} ${ready === 1 ? 'item' : 'items'} published in ${unitTitle}.`
          : `${unitTitle} is now visible to students, with ${ready} ${ready === 1 ? 'item' : 'items'} published.`,
      );
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'That could not be published.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="confirm" data-testid="unit-review">
      <p className="confirm-title">
        {open ? `Publish the drafts in ${unitTitle}` : `Review ${unitTitle} before students see it`}
      </p>
      <table className="review-table">
        <thead>
          <tr>
            <th>Part</th>
            <th>Published</th>
            <th>Ready to publish</th>
            <th>Held for a check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td className="num">{row.tally.published}</td>
              <td className="num" data-testid={`ready-${row.label}`}>{row.tally.ready}</td>
              <td className="num" data-tone={row.tally.held > 0 ? 'held' : undefined}>
                {row.tally.held}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="confirm-body">
        {held > 0
          ? `${held} ${held === 1 ? 'item' : 'items'} the import could not be sure of will stay as drafts whatever you press here. Each needs your check on its own.`
          : 'Nothing is held back for a check.'}{' '}
        {open
          ? 'The unit is already visible, so published items appear straight away.'
          : 'Opening the unit makes its published items visible to students.'}
      </p>
      <div className="row">
        {mayPublish ? (
          <button className="primary" onClick={() => void publish()} disabled={busy} data-testid="confirm-publish">
            {busy
              ? 'Publishing…'
              : open
                ? `Publish ${ready} ${ready === 1 ? 'item' : 'items'}`
                : `Publish ${ready} ${ready === 1 ? 'item' : 'items'} and open the unit`}
          </button>
        ) : (
          <span className="muted" data-testid="publish-refused">
            Only a teacher can publish. Ask a teacher to review this unit.
          </span>
        )}
        <button onClick={onCancel} disabled={busy}>
          {mayPublish ? 'Not now' : 'Close'}
        </button>
      </div>
    </div>
  );
}

/** Whether `me` may change or remove this item at all; mirrors the API. */
export function canChange(me: Pick<Me, 'role'>, item: { status: ContentStatus }): boolean {
  return me.role === 'TEACHER' || item.status === 'DRAFT';
}
