'use client';

import { useState } from 'react';
import { apiUrl, AttemptQuestion } from '@/lib/api';
import { Icon } from './Icon';

/**
 * How each kind of question looks and behaves for the student.
 *
 * The engine on the API decides everything that matters — which questions,
 * in what order, with which choices, and what counts as right. These
 * components only draw what they are handed and report what she did, so
 * adding a kind here can never change how anything is marked.
 *
 * Two rules run through all of them:
 *
 *   Everything is tappable. This is a phone-first screen for eleven-year-olds,
 *   so a choice is a card she taps, not a radio button beside a line of text.
 *
 *   Matching and ordering are tap-to-place first, with dragging added on top.
 *   HTML5 dragging does not work on a touchscreen at all, so a drag-only
 *   version would leave the questions unanswerable on exactly the devices most
 *   of these students will use. Tapping works the same way with a mouse and a
 *   finger; dragging is an extra for those who reach for it.
 */

/** What a finished question knows about how it was marked. */
interface Marked {
  finished: boolean;
  /** True where this element is the one she chose. */
  picked: boolean;
  /** True where this element is the right answer. */
  correct: boolean;
}

/** The class for a choice card, before and after marking. */
function choiceClass({ finished, picked, correct }: Marked): string {
  if (!finished) return picked ? 'choice picked' : 'choice';
  if (correct) return 'choice right';
  if (picked) return 'choice wrong';
  return 'choice';
}

interface Item {
  id: string;
  text: string;
}

function itemsFrom(value: unknown): Item[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((i): i is Item => Boolean(i) && typeof i === 'object' && 'id' in i && 'text' in i)
    .map((i) => ({ id: String(i.id), text: String(i.text) }));
}

/** Pictures frozen into the question, part of what she was asked. */
export function QuestionPictures({ question }: { question: AttemptQuestion }) {
  const media = question.media ?? [];
  if (media.length === 0) return null;

  return (
    <div className="question-pictures">
      {media.map((file) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={file.id}
          src={apiUrl(file.url)}
          alt={file.altText ?? 'Picture for this question'}
          data-testid="question-picture"
        />
      ))}
    </div>
  );
}

/**
 * One correct answer out of several, as cards she taps.
 *
 * Multiple choice, odd one out, completing a sentence, choosing the missing
 * letter and matching a word to a picture all arrive here: they are one
 * question kind as far as marking goes, and differ only in how they read.
 * A short choice — a single letter, or one word — is laid out as a row of
 * tiles rather than a stack of full-width bars.
 */
export function ChoiceQuestion({
  question,
  finished,
  response,
  onAnswer,
}: {
  question: AttemptQuestion;
  finished: boolean;
  response: unknown;
  onAnswer: (value: unknown) => void;
}) {
  const options = itemsFrom(question.payload?.options);

  const picked =
    response && typeof response === 'object' && 'optionId' in response
      ? String((response as { optionId: unknown }).optionId)
      : null;

  const expected =
    question.expected && typeof question.expected.correctOptionId === 'string'
      ? question.expected.correctOptionId
      : null;

  // Single letters and short words read better side by side than stacked.
  const compact = options.every((o) => o.text.trim().length <= 3);

  return (
    <div className={compact ? 'tile-row' : 'stack choice-stack'}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={finished}
          aria-pressed={picked === option.id}
          className={`${choiceClass({
            finished,
            picked: picked === option.id,
            correct: expected === option.id,
          })}${compact ? ' tile' : ''}`}
          onClick={() => onAnswer({ optionId: option.id })}
          data-testid={`option-${question.answerId}-${option.id}`}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

/** True or false, as two large choices. */
export function TrueFalseQuestion({
  question,
  finished,
  response,
  onAnswer,
}: {
  question: AttemptQuestion;
  finished: boolean;
  response: unknown;
  onAnswer: (value: unknown) => void;
}) {
  const picked =
    response && typeof response === 'object' && 'value' in response
      ? Boolean((response as { value: unknown }).value)
      : null;

  // The answer key for this kind reads `{ correct: true }`. Reading `value`
  // here — the shape of her *answer*, not of the key — meant the right answer
  // was never marked on a finished paper.
  const expected =
    question.expected && typeof question.expected.correct === 'boolean'
      ? question.expected.correct
      : null;

  return (
    /*
      Two opposed choices, side by side. The tick and cross are the worksheet's
      own shorthand for true and false, so they belong here — but they are
      drawn in the neutral glyph colour, not the marking colours. Green on
      "True" before she has answered reads as the answer being given away.
    */
    <div className="tf-pair">
      {[true, false].map((value) => (
        <button
          key={String(value)}
          type="button"
          disabled={finished}
          aria-pressed={picked === value}
          className={`${choiceClass({
            finished,
            picked: picked === value,
            correct: expected === value,
          })} big-choice`}
          onClick={() => onAnswer({ value })}
          data-testid={`tf-${question.answerId}-${value}`}
        >
          <span className="tf-glyph" aria-hidden="true">
            <Icon name={value ? 'tick' : 'cross'} size={22} />
          </span>
          {value ? 'True' : 'False'}
        </button>
      ))}
    </div>
  );
}

/**
 * Match each word on the left to one on the right.
 *
 * Tap a word on the left, then its partner on the right, and the pair is
 * made; tap a made pair to undo it. Dragging one onto the other does the same
 * thing for anyone who tries it.
 */
export function MatchingQuestion({
  question,
  finished,
  response,
  onAnswer,
}: {
  question: AttemptQuestion;
  finished: boolean;
  response: unknown;
  onAnswer: (value: unknown) => void;
}) {
  const left = itemsFrom(question.payload?.left);
  const right = itemsFrom(question.payload?.right);

  const pairs =
    response && typeof response === 'object' && 'pairs' in response
      ? ((response as { pairs: Record<string, string> }).pairs ?? {})
      : {};

  const expected =
    question.expected && typeof question.expected.pairs === 'object'
      ? ((question.expected.pairs as Record<string, string>) ?? {})
      : {};

  const [holding, setHolding] = useState<string | null>(null);

  function pair(leftId: string, rightId: string) {
    // One partner each way: giving a right-hand word to a new left-hand word
    // takes it away from whoever had it, so the columns cannot disagree.
    const next: Record<string, string> = {};
    for (const [l, r] of Object.entries(pairs)) {
      if (l !== leftId && r !== rightId) next[l] = r;
    }
    next[leftId] = rightId;
    onAnswer({ pairs: next });
    setHolding(null);
  }

  function unpair(leftId: string) {
    const next = { ...pairs };
    delete next[leftId];
    onAnswer({ pairs: next });
    setHolding(null);
  }

  const takenRight = new Set(Object.values(pairs));
  const textOf = (id: string) => right.find((r) => r.id === id)?.text ?? '';

  return (
    <div className="stack" data-testid={`matching-${question.answerId}`}>
      {!finished && (
        <p className="muted hint" style={{ margin: 0 }}>
          {holding
            ? 'Now tap its partner on the right.'
            : 'Tap a word on the left, then its partner on the right.'}
        </p>
      )}

      <div className="match-columns">
        <div className="stack" style={{ gap: '.4rem' }}>
          {left.map((item) => {
            const partner = pairs[item.id];
            const rightAnswer = expected[item.id];
            const wasRight = finished && partner !== undefined && partner === rightAnswer;
            const wasWrong = finished && partner !== undefined && partner !== rightAnswer;

            return (
              <button
                key={item.id}
                type="button"
                disabled={finished}
                className={`choice match-left${holding === item.id ? ' picked' : ''}${
                  wasRight ? ' right' : ''
                }${wasWrong ? ' wrong' : ''}`}
                onClick={() => (partner ? unpair(item.id) : setHolding(item.id))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = e.dataTransfer.getData('text/plain');
                  if (dropped) pair(item.id, dropped);
                }}
                data-testid={`match-left-${item.id}`}
              >
                <span>{item.text}</span>
                {partner !== undefined && (
                  <span className="match-partner" data-testid={`match-pair-${item.id}`}>
                    → {textOf(partner)}
                  </span>
                )}
                {finished && rightAnswer !== undefined && partner !== rightAnswer && (
                  <span className="match-partner">{textOf(rightAnswer)}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="stack" style={{ gap: '.4rem' }}>
          {right.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={finished || (takenRight.has(item.id) && holding === null)}
              draggable={!finished}
              onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
              className={`choice match-right${takenRight.has(item.id) ? ' used' : ''}`}
              onClick={() => holding && pair(holding, item.id)}
              data-testid={`match-right-${item.id}`}
            >
              {item.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Put the words in order to make a sentence.
 *
 * Tap a word to add it to the sentence, tap it again in the sentence to take
 * it back. Dragging a word into the sentence does the same.
 */
export function OrderingQuestion({
  question,
  finished,
  response,
  onAnswer,
}: {
  question: AttemptQuestion;
  finished: boolean;
  response: unknown;
  onAnswer: (value: unknown) => void;
}) {
  const tokens = itemsFrom(question.payload?.tokens);

  const order =
    response && typeof response === 'object' && 'order' in response
      ? ((response as { order: string[] }).order ?? [])
      : [];

  const expected =
    question.expected && Array.isArray(question.expected.order)
      ? (question.expected.order as string[])
      : null;

  const textOf = (id: string) => tokens.find((t) => t.id === id)?.text ?? '';
  const remaining = tokens.filter((t) => !order.includes(t.id));

  return (
    <div className="stack" data-testid={`ordering-${question.answerId}`}>
      {!finished && (
        <p className="muted hint" style={{ margin: 0 }}>
          Tap the words in the right order. Tap one in your sentence to take it back.
        </p>
      )}

      <div
        className="sentence-tray"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = e.dataTransfer.getData('text/plain');
          if (dropped && !order.includes(dropped)) onAnswer({ order: [...order, dropped] });
        }}
        data-testid={`ordering-sentence-${question.answerId}`}
      >
        {order.length === 0 && <span className="muted">Your sentence appears here.</span>}
        {order.map((id, index) => (
          <button
            key={`${id}-${index}`}
            type="button"
            disabled={finished}
            className={`word-tile placed${
              finished ? (expected && expected[index] === id ? ' right' : ' wrong') : ''
            }`}
            onClick={() => onAnswer({ order: order.filter((o) => o !== id) })}
            data-testid={`ordering-placed-${id}`}
          >
            {textOf(id)}
          </button>
        ))}
      </div>

      {!finished && (
        <div className="word-bank">
          {remaining.map((token) => (
            <button
              key={token.id}
              type="button"
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/plain', token.id)}
              /* A word is as wide as the word. The square tile is for single
                 letters; using it here ran "eaten" and "dogs" together. */
              className="word-tile"
              onClick={() => onAnswer({ order: [...order, token.id] })}
              data-testid={`ordering-token-${token.id}`}
            >
              {token.text}
            </button>
          ))}
        </div>
      )}

      {finished && expected && (
        <p className="muted" style={{ margin: 0 }} data-testid="ordering-expected">
          The right order: {expected.map(textOf).join(' ')}
        </p>
      )}
    </div>
  );
}

/**
 * She types the answer: spelling, a word for a picture, or a short answer.
 *
 * Missing-letter questions written as typed rather than as a choice arrive
 * here too, so the box is generous and the text is large — this is written on
 * a phone by an eleven-year-old.
 */
export function TypedQuestion({
  question,
  finished,
  response,
  onAnswer,
}: {
  question: AttemptQuestion;
  finished: boolean;
  response: unknown;
  onAnswer: (value: unknown) => void;
}) {
  const text =
    response && typeof response === 'object' && 'text' in response
      ? String((response as { text: unknown }).text)
      : '';

  const accepted =
    question.expected && Array.isArray(question.expected.accepted)
      ? (question.expected.accepted as string[])
      : null;

  return (
    <div className="stack" style={{ gap: '.4rem' }}>
      <label style={{ fontWeight: 400 }}>
        Your answer
        <input
          type="text"
          className="answer-box"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={finished}
          value={text}
          onChange={(e) => onAnswer({ text: e.target.value })}
          data-testid={`typed-${question.answerId}`}
        />
      </label>

      {finished && accepted && (
        <p className="muted" style={{ margin: 0 }} data-testid="typed-expected">
          {accepted.length === 1 ? 'The answer: ' : 'Accepted answers: '}
          {accepted.join(', ')}
        </p>
      )}
    </div>
  );
}

/**
 * Picks the view for a question's kind.
 *
 * A kind nobody has written a view for still gets a usable one: the typed box
 * is what every kind fell back to before this file existed, so a new kind
 * added to the engine is answerable from the day it is added rather than
 * appearing as an empty card.
 */
export function QuestionBody(props: {
  question: AttemptQuestion;
  finished: boolean;
  response: unknown;
  onAnswer: (value: unknown) => void;
}) {
  const { question } = props;

  if (question.typeKey === 'true_false') return <TrueFalseQuestion {...props} />;
  if (question.typeKey === 'matching') return <MatchingQuestion {...props} />;
  if (question.typeKey === 'word_ordering') return <OrderingQuestion {...props} />;

  // Every choice-marked kind sends its options in the payload. Reading the
  // options rather than listing the keys means a kind added to the engine as
  // a choice question works here without this file being touched.
  if (itemsFrom(question.payload?.options).length > 0) return <ChoiceQuestion {...props} />;

  return <TypedQuestion {...props} />;
}
