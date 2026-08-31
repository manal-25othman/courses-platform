'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  apiUrl,
  choicesOf,
  correctChoiceId,
  Choice,
  Pair,
  pairsOf,
  Question,
  QuestionPurpose,
  QuestionType,
  ReviewSummary,
  Section,
  sentenceOf,
} from '@/lib/api';

/**
 * The teacher's questions for one unit — her practice ones, or her assessment.
 *
 * Two jobs. The first is correcting what was read out of the Word file, some
 * of which is wrong: she has to be able to fix the wording, the choices and
 * above all the correct answer, here rather than by asking for a code change.
 * The second is writing new questions, which until Phase 6 she could not do at
 * all.
 *
 * Nothing in this file knows how a question is marked. It builds the shape the
 * engine expects and the engine refuses anything it cannot mark, so a question
 * that would break a student's paper is turned away when she saves it rather
 * than when a student meets it.
 */
export function QuestionList({
  unitId,
  purpose,
  sections,
  onRun,
}: {
  unitId: string;
  /** Which pool this is: her practice questions, or the unit's assessment. */
  purpose: QuestionPurpose;
  /** The unit's grammar sections, so an exercise can be linked to its rule. */
  sections: Section[];
  onRun: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [types, setTypes] = useState<QuestionType[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [onlyReview, setOnlyReview] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const isAssessment = purpose === 'ASSESSMENT';

  const load = useCallback(async () => {
    const query = `?purpose=${purpose}${onlyReview ? '&needsReview=true' : ''}`;
    const [list, review, kinds] = await Promise.all([
      api.get<Question[]>(`/questions/unit/${unitId}${query}`),
      api.get<ReviewSummary>(`/questions/unit/${unitId}/review-summary`),
      api.get<QuestionType[]>('/questions/types'),
    ]);
    setQuestions(list);
    setSummary(review);
    setTypes(kinds);
    setLoaded(true);
  }, [unitId, purpose, onlyReview]);

  useEffect(() => {
    void load().catch(() => setLoaded(true));
  }, [load]);

  async function save(work: () => Promise<unknown>, message: string) {
    await onRun(work, message);
    await load();
  }

  const heading = isAssessment ? 'Assessment questions' : 'Activity questions';

  if (!loaded) {
    return (
      <div className="card">
        <h2 style={{ margin: 0 }}>{heading}</h2>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="card stack">
      <div className="between">
        <h2 style={{ margin: 0 }}>
          {heading} ({questions.length})
        </h2>
        <div className="row">
          <label className="row" style={{ gap: '.4rem', fontSize: '.9rem' }}>
            <input
              type="checkbox"
              checked={onlyReview}
              onChange={(e) => setOnlyReview(e.target.checked)}
              aria-label="Show only questions needing review"
            />
            Only those needing a check
          </label>
          <button
            className="primary small"
            onClick={() => setAdding((open) => !open)}
            data-testid="add-question"
          >
            {adding ? 'Close' : 'Add a question'}
          </button>
        </div>
      </div>

      {isAssessment && (
        <p className="muted" style={{ margin: 0 }}>
          These are the questions a student must pass to finish the unit. They are separate from
          the practice activities and are never mixed into them.
        </p>
      )}

      {summary && summary.needingReview > 0 && !isAssessment && (
        <p className="alert warn" role="status">
          {summary.needingReview} question{summary.needingReview === 1 ? '' : 's'} could not be read
          from the file and need{summary.needingReview === 1 ? 's' : ''} your answer before it can
          be published.
        </p>
      )}

      {summary && (
        <p className="muted" data-testid="question-summary">
          {isAssessment
            ? `${summary.assessmentPublished} of ${summary.assessmentTotal} published`
            : `${summary.published} published · ${summary.readyToPublish} ready · ${summary.needingReview} needing a check`}
        </p>
      )}

      {adding && (
        <NewQuestion
          unitId={unitId}
          purpose={purpose}
          types={types}
          sections={sections}
          onSave={save}
          onDone={() => setAdding(false)}
        />
      )}

      {questions.length === 0 ? (
        <p className="muted" data-testid="no-questions">
          {onlyReview
            ? 'Nothing here needs checking.'
            : isAssessment
              ? 'This unit has no assessment yet. Add a question to start one.'
              : 'This unit has no questions yet.'}
        </p>
      ) : (
        questions.map((question) => (
          <QuestionRow
            key={question.id}
            question={question}
            sections={sections}
            isEditing={editing === question.id}
            onToggle={() => setEditing(editing === question.id ? null : question.id)}
            onSave={save}
          />
        ))
      )}
    </div>
  );
}

/** A stable-enough id for a new answer choice. */
function newChoiceId(): string {
  return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Which kinds this form can write.
 *
 * The engine supports more than these, and any of them can still be corrected
 * through the raw-answer box below. This list is the ones with a form of their
 * own, and it is checked against what the API says it supports rather than
 * being a second, hand-kept copy of the engine's registry.
 */
const CHOICE_KINDS = [
  'multiple_choice',
  'complete_sentence',
  'odd_one_out',
  'missing_letter',
  'picture_matching',
] as const;

const TYPED_KINDS = ['spelling', 'short_answer', 'picture_word', 'grammar_transformation'] as const;

/** Two columns and a map between them. */
const MATCHING_KIND = 'matching';

/** Words to be put in order. */
const ORDERING_KIND = 'word_ordering';

/**
 * Turns the pairs a teacher wrote into the shape the engine marks.
 *
 * She writes rows — "sun goes with day". The engine wants two columns and a
 * map, because it shuffles the columns independently so their positions carry
 * no hint. The ids never reach her.
 */
export function pairsToQuestion(pairs: Pair[]): {
  payload: Record<string, unknown>;
  answerKey: Record<string, unknown>;
} {
  const filled = pairs.filter((p) => p.left.trim() !== '' && p.right.trim() !== '');
  const left = filled.map((p, i) => ({ id: `l${i + 1}`, text: p.left.trim() }));
  const right = filled.map((p, i) => ({ id: `r${i + 1}`, text: p.right.trim() }));
  const map: Record<string, string> = {};
  filled.forEach((_, i) => {
    map[`l${i + 1}`] = `r${i + 1}`;
  });

  return { payload: { left, right }, answerKey: { pairs: map } };
}

/**
 * Turns a sentence into words to be put in order.
 *
 * The teacher types the sentence the right way round; the engine shuffles it.
 * Each word keeps its own id, so the same word twice in one sentence is two
 * separate tiles rather than one that cannot be told apart.
 */
export function sentenceToQuestion(sentence: string): {
  payload: Record<string, unknown>;
  answerKey: Record<string, unknown>;
} {
  const words = sentence.trim().split(/\s+/).filter((w) => w !== '');
  const tokens = words.map((text, i) => ({ id: `t${i + 1}`, text }));

  return { payload: { tokens }, answerKey: { order: tokens.map((t) => t.id) } };
}

/**
 * Writing a new question.
 *
 * The form follows the kind she picks: choices to fill in and one to mark
 * correct, a true/false switch, or the accepted answers she will take. Nothing
 * is guessed — an accepted alternative spelling is hers to add, because
 * inventing one would be inventing curriculum.
 */
function NewQuestion({
  unitId,
  purpose,
  types,
  sections,
  onSave,
  onDone,
}: {
  unitId: string;
  purpose: QuestionPurpose;
  types: QuestionType[];
  sections: Section[];
  onSave: (work: () => Promise<unknown>, message: string) => Promise<void>;
  onDone: () => void;
}) {
  const writable = types.filter(
    (t) =>
      (CHOICE_KINDS as readonly string[]).includes(t.key) ||
      (TYPED_KINDS as readonly string[]).includes(t.key) ||
      t.key === 'true_false' ||
      t.key === MATCHING_KIND ||
      t.key === ORDERING_KIND,
  );

  const [typeKey, setTypeKey] = useState(writable[0]?.key ?? 'multiple_choice');
  const [prompt, setPrompt] = useState('');
  const [choices, setChoices] = useState<Choice[]>([
    { id: newChoiceId(), text: '' },
    { id: newChoiceId(), text: '' },
  ]);
  const [correct, setCorrect] = useState<string | null>(null);
  const [trueFalse, setTrueFalse] = useState(true);
  const [accepted, setAccepted] = useState('');
  const [pairs, setPairs] = useState<Pair[]>([
    { id: 'p1', left: '', right: '' },
    { id: 'p2', left: '', right: '' },
  ]);
  const [sentence, setSentence] = useState('');
  const [points, setPoints] = useState(1);
  const [sectionId, setSectionId] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const isChoice = (CHOICE_KINDS as readonly string[]).includes(typeKey);
  const isTrueFalse = typeKey === 'true_false';
  const isMatching = typeKey === MATCHING_KIND;
  const isOrdering = typeKey === ORDERING_KIND;

  async function submit() {
    setProblem(null);

    if (prompt.trim() === '') {
      setProblem('Write the question first.');
      return;
    }

    let payload: Record<string, unknown> = {};
    let answerKey: Record<string, unknown> = {};

    if (isChoice) {
      const filled = choices.filter((c) => c.text.trim() !== '');
      if (filled.length < 2) {
        setProblem('A question like this needs at least two answer choices.');
        return;
      }
      if (!correct || !filled.some((c) => c.id === correct)) {
        setProblem('Mark which choice is the correct one.');
        return;
      }
      payload = { options: filled };
      answerKey = { correctOptionId: correct };
    } else if (isTrueFalse) {
      answerKey = { correct: trueFalse };
    } else if (isMatching) {
      const built = pairsToQuestion(pairs);
      if ((built.payload.left as unknown[]).length < 2) {
        setProblem('A matching question needs at least two complete pairs.');
        return;
      }
      payload = built.payload;
      answerKey = built.answerKey;
    } else if (isOrdering) {
      const built = sentenceToQuestion(sentence);
      if ((built.payload.tokens as unknown[]).length < 2) {
        setProblem('Write a sentence of at least two words for her to put in order.');
        return;
      }
      payload = built.payload;
      answerKey = built.answerKey;
    } else {
      const list = accepted
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
      if (list.length === 0) {
        setProblem('Write the answer you will accept.');
        return;
      }
      answerKey = { accepted: list };
    }

    await onSave(
      () =>
        api.post(`/questions/unit/${unitId}`, {
          typeKey,
          prompt: prompt.trim(),
          payload,
          answerKey,
          points,
          purpose,
          ...(sectionId ? { sectionId } : {}),
        }),
      'Question added as a draft.',
    );
    onDone();
  }

  return (
    <div
      className="card stack"
      style={{ background: 'var(--bg)' }}
      data-testid="new-question-form"
    >
      <h3 style={{ margin: 0, fontSize: '1rem' }}>A new question</h3>

      {problem && (
        <p className="alert error" role="alert">
          {problem}
        </p>
      )}

      <label>
        Kind of question
        <select
          value={typeKey}
          onChange={(e) => setTypeKey(e.target.value)}
          data-testid="new-question-type"
        >
          {writable.map((type) => (
            <option key={type.key} value={type.key}>
              {type.displayName}
            </option>
          ))}
        </select>
      </label>

      <label>
        Question
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Write the question exactly as it should be shown"
          data-testid="new-question-prompt"
        />
      </label>

      {isChoice && (
        <ChoiceFields
          choices={choices}
          correct={correct}
          name="new-question"
          onChange={setChoices}
          onCorrect={setCorrect}
        />
      )}

      {isTrueFalse && (
        <fieldset className="fieldset">
          <legend>The correct answer</legend>
          <div className="row">
            {[true, false].map((value) => (
              <label key={String(value)} className="row" style={{ gap: '.4rem' }}>
                <input
                  type="radio"
                  name="new-question-tf"
                  checked={trueFalse === value}
                  onChange={() => setTrueFalse(value)}
                  data-testid={`new-question-tf-${value}`}
                />
                {value ? 'True' : 'False'}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {isMatching && <PairFields pairs={pairs} onChange={setPairs} />}

      {isOrdering && <SentenceField value={sentence} onChange={setSentence} />}

      {!isChoice && !isTrueFalse && !isMatching && !isOrdering && (
        <label>
          Answers you will accept — one per line
          <textarea
            rows={3}
            value={accepted}
            onChange={(e) => setAccepted(e.target.value)}
            placeholder={'garden\nthe garden'}
            data-testid="new-question-accepted"
          />
        </label>
      )}

      <div className="row">
        <label style={{ maxWidth: '8rem' }}>
          Marks
          <input
            type="number"
            min={1}
            value={points}
            onChange={(e) => setPoints(Math.max(1, Number(e.target.value)))}
            aria-label="Marks for this question"
          />
        </label>

        <SectionPicker sections={sections} value={sectionId} onChange={setSectionId} />
      </div>

      <div className="row">
        <button className="primary" onClick={submit} data-testid="save-new-question">
          Add the question
        </button>
        <button onClick={onDone}>Cancel</button>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
        It is saved as a draft. Students see it once you publish it, and you can add a picture to
        it after saving.
      </p>
    </div>
  );
}

/** The grammar section an exercise practises, if it practises one. */
function SectionPicker({
  sections,
  value,
  onChange,
}: {
  sections: Section[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label style={{ flex: 1, minWidth: '14rem' }}>
      Goes with the grammar section
      <select value={value} onChange={(e) => onChange(e.target.value)} data-testid="section-link">
        <option value="">Not linked to one</option>
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.title ?? section.type.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The pairs of a matching question.
 *
 * One row per pair, which is how a teacher thinks about it: "sun goes with
 * day". Two is the fewest that is still a question, which is also the engine's
 * rule.
 */
function PairFields({
  pairs,
  onChange,
}: {
  pairs: Pair[];
  onChange: (pairs: Pair[]) => void;
}) {
  return (
    <fieldset className="fieldset" data-testid="pair-fields">
      <legend>Pairs — each word on the left goes with the one on its right</legend>

      {pairs.map((pair, index) => (
        <div key={pair.id} className="row" style={{ marginBottom: '.5rem' }}>
          <input
            type="text"
            value={pair.left}
            onChange={(e) =>
              onChange(pairs.map((p) => (p.id === pair.id ? { ...p, left: e.target.value } : p)))
            }
            aria-label={`Pair ${index + 1}, left`}
            data-testid={`pair-left-${pair.id}`}
            style={{ flex: 1 }}
          />
          <span aria-hidden="true">→</span>
          <input
            type="text"
            value={pair.right}
            onChange={(e) =>
              onChange(pairs.map((p) => (p.id === pair.id ? { ...p, right: e.target.value } : p)))
            }
            aria-label={`Pair ${index + 1}, right`}
            data-testid={`pair-right-${pair.id}`}
            style={{ flex: 1 }}
          />
          <button
            className="small danger"
            disabled={pairs.length <= 2}
            onClick={() => onChange(pairs.filter((p) => p.id !== pair.id))}
            aria-label={`Remove pair ${index + 1}`}
            data-testid={`remove-pair-${pair.id}`}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        className="small"
        onClick={() => onChange([...pairs, { id: newChoiceId(), left: '', right: '' }])}
        data-testid="add-pair"
      >
        Add another pair
      </button>

      <p className="muted" style={{ margin: '.5rem 0 0', fontSize: '.85rem' }}>
        The two columns are shuffled separately when a student sees them, so their positions never
        give the answer away.
      </p>
    </fieldset>
  );
}

/**
 * The sentence of a word-ordering question.
 *
 * She types it the right way round and the engine shuffles it. One box rather
 * than a list of words, because that is how the sentence exists in her head and
 * in the curriculum.
 */
function SentenceField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const words = value.trim().split(/\s+/).filter((w) => w !== '');

  return (
    <label>
      The sentence, written correctly
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="She likes reading books"
        data-testid="ordering-sentence"
      />
      <span className="muted" style={{ fontSize: '.85rem' }} data-testid="ordering-preview">
        {words.length < 2
          ? 'Write at least two words.'
          : `${words.length} words. She will see them shuffled: ${words.join(' · ')}`}
      </span>
    </label>
  );
}

/** Answer choices, with adding and removing. */
function ChoiceFields({
  choices,
  correct,
  name,
  onChange,
  onCorrect,
}: {
  choices: Choice[];
  correct: string | null;
  name: string;
  onChange: (choices: Choice[]) => void;
  onCorrect: (id: string) => void;
}) {
  function remove(id: string) {
    onChange(choices.filter((c) => c.id !== id));
  }

  return (
    <fieldset className="fieldset">
      <legend>Answer choices — select the correct one</legend>

      {choices.map((choice, index) => (
        <div key={choice.id} className="row" style={{ marginBottom: '.5rem' }}>
          <input
            type="radio"
            name={`correct-${name}`}
            checked={correct === choice.id}
            onChange={() => onCorrect(choice.id)}
            aria-label={`Mark choice ${index + 1} correct`}
            data-testid={`correct-${choice.id}`}
          />
          <input
            type="text"
            value={choice.text}
            onChange={(e) =>
              onChange(choices.map((c) => (c.id === choice.id ? { ...c, text: e.target.value } : c)))
            }
            aria-label={`Answer choice ${index + 1}`}
            data-testid={`choice-${choice.id}`}
            style={{ flex: 1 }}
          />
          {/*
            Two is the fewest a choice question can have and still be a
            question, which is the engine's rule as well as this one.
          */}
          <button
            className="small danger"
            disabled={choices.length <= 2}
            onClick={() => remove(choice.id)}
            aria-label={`Remove answer choice ${index + 1}`}
            data-testid={`remove-choice-${choice.id}`}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        className="small"
        onClick={() => onChange([...choices, { id: newChoiceId(), text: '' }])}
        data-testid="add-choice"
      >
        Add another choice
      </button>
    </fieldset>
  );
}

function QuestionRow({
  question,
  sections,
  isEditing,
  onToggle,
  onSave,
}: {
  question: Question;
  sections: Section[];
  isEditing: boolean;
  onToggle: () => void;
  onSave: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const choices = choicesOf(question);
  const correct = correctChoiceId(question);

  return (
    <div className="card" style={{ background: 'var(--bg)' }} data-question-id={question.id}>
      <div className="between">
        <div style={{ minWidth: 0 }}>
          <strong data-testid="question-prompt">{question.prompt}</strong>
          <div className="muted" style={{ fontSize: '.85rem', marginTop: '.2rem' }}>
            {question.type?.displayName ?? question.typeKey}
            {question.sourceRef ? ` · from the file (${question.sourceRef})` : ''}
            {` · ${question.points} mark${question.points === 1 ? '' : 's'}`}
            {question.section && (
              <span data-testid="linked-section">
                {' · goes with '}
                {question.section.title ?? 'a grammar section'}
              </span>
            )}
          </div>
        </div>
        <div className="row">
          {question.needsReview && (
            <span className="badge disabled" data-testid="needs-review">
              Needs a check
            </span>
          )}
          <span className={`badge ${question.status === 'PUBLISHED' ? 'active' : 'disabled'}`}>
            {question.status === 'PUBLISHED' ? 'Published' : 'Draft'}
          </span>
          <button className="small" onClick={onToggle} aria-label={`Edit: ${question.prompt}`}>
            {isEditing ? 'Close' : 'Edit'}
          </button>
        </div>
      </div>

      {question.reviewNotes && (
        <p className="muted" style={{ marginTop: '.5rem' }} data-testid="review-note">
          {question.reviewNotes}
        </p>
      )}

      {(question.media?.length ?? 0) > 0 && (
        <div className="question-pictures" style={{ marginTop: '.5rem' }}>
          {question.media?.map((file) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={file.id}
              src={apiUrl(file.url)}
              alt={file.altText ?? 'Picture on this question'}
              data-testid="question-image"
            />
          ))}
        </div>
      )}

      {!isEditing && choices.length > 0 && (
        <ul style={{ margin: '.6rem 0 0', paddingInlineStart: '1.2rem' }}>
          {choices.map((choice) => (
            <li key={choice.id} data-testid="choice-readonly">
              {choice.text}
              {correct === choice.id && (
                <span className="badge active" style={{ marginInlineStart: '.5rem' }}>
                  Correct
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/*
        What the answer is, in words. A raw dump of the stored key is fine for
        a developer and useless to a teacher checking her own work, so each
        kind that has a shape reads it back in that shape.
      */}
      {!isEditing && choices.length === 0 && !correct && (
        <div className="muted" style={{ marginTop: '.5rem' }} data-testid="answer-summary">
          {question.typeKey === 'matching' ? (
            <ul style={{ margin: 0, paddingInlineStart: '1.2rem' }}>
              {pairsOf(question).map((pair) => (
                <li key={pair.id}>
                  {pair.left} → {pair.right}
                </li>
              ))}
            </ul>
          ) : question.typeKey === 'word_ordering' ? (
            <span>In order: {sentenceOf(question)}</span>
          ) : question.typeKey === 'true_false' ? (
            <span>Answer: {question.answerKey?.correct === true ? 'True' : 'False'}</span>
          ) : Array.isArray(question.answerKey?.accepted) ? (
            <span>Accepted: {(question.answerKey.accepted as string[]).join(', ')}</span>
          ) : (
            <span>
              Answer: <code>{JSON.stringify(question.answerKey)}</code>
            </span>
          )}
        </div>
      )}

      {isEditing && (
        <QuestionEditor
          question={question}
          sections={sections}
          onSave={onSave}
          onDone={onToggle}
        />
      )}
    </div>
  );
}

/**
 * Editing one question.
 *
 * Choice questions get a proper form, because that is nearly every question
 * this curriculum contains. Any other shape falls back to editing the stored
 * answer directly, so a kind added later is still correctable here rather than
 * being stuck until someone writes a form for it.
 */
function QuestionEditor({
  question,
  sections,
  onSave,
  onDone,
}: {
  question: Question;
  sections: Section[];
  onSave: (work: () => Promise<unknown>, message: string) => Promise<void>;
  onDone: () => void;
}) {
  const [prompt, setPrompt] = useState(question.prompt);
  const [choices, setChoices] = useState<Choice[]>(choicesOf(question));
  const [correct, setCorrect] = useState<string | null>(correctChoiceId(question));
  const [pairs, setPairs] = useState<Pair[]>(pairsOf(question));
  const [sentence, setSentence] = useState(sentenceOf(question));
  const [trueFalse, setTrueFalse] = useState(question.answerKey?.correct === true);
  const [accepted, setAccepted] = useState(
    Array.isArray(question.answerKey?.accepted)
      ? (question.answerKey.accepted as string[]).join('\n')
      : '',
  );
  const [points, setPoints] = useState(question.points);
  const [sectionId, setSectionId] = useState(question.sectionId ?? '');
  const [rawKey, setRawKey] = useState(JSON.stringify(question.answerKey, null, 2));
  const [reviewed, setReviewed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const isChoiceKind = choices.length > 0;
  const isMatching = question.typeKey === MATCHING_KIND;
  const isOrdering = question.typeKey === ORDERING_KIND;
  const isTrueFalse = question.typeKey === 'true_false';
  const isTyped = (TYPED_KINDS as readonly string[]).includes(question.typeKey);
  // Anything with no form of its own still gets the stored answer directly, so
  // a kind added to the engine later is correctable from the day it exists.
  const needsRawKey = !isChoiceKind && !isMatching && !isOrdering && !isTrueFalse && !isTyped;

  async function submit() {
    setProblem(null);

    const body: Record<string, unknown> = { prompt, points, sectionId };

    if (isChoiceKind) {
      if (!correct || !choices.some((c) => c.id === correct)) {
        setProblem('Choose which answer is the correct one.');
        return;
      }
      if (choices.some((c) => c.text.trim() === '')) {
        setProblem('An answer choice cannot be empty.');
        return;
      }
      body.payload = { ...question.payload, options: choices };
      body.answerKey = { correctOptionId: correct };
    } else if (isMatching) {
      const built = pairsToQuestion(pairs);
      if ((built.payload.left as unknown[]).length < 2) {
        setProblem('A matching question needs at least two complete pairs.');
        return;
      }
      body.payload = built.payload;
      body.answerKey = built.answerKey;
    } else if (isOrdering) {
      const built = sentenceToQuestion(sentence);
      if ((built.payload.tokens as unknown[]).length < 2) {
        setProblem('Write a sentence of at least two words for her to put in order.');
        return;
      }
      body.payload = built.payload;
      body.answerKey = built.answerKey;
    } else if (isTrueFalse) {
      body.answerKey = { correct: trueFalse };
    } else if (isTyped) {
      const list = accepted.split('\n').map((l) => l.trim()).filter((l) => l !== '');
      if (list.length === 0) {
        setProblem('Write the answer you will accept.');
        return;
      }
      body.answerKey = { accepted: list };
    } else {
      try {
        body.answerKey = JSON.parse(rawKey);
      } catch {
        setProblem('That answer is not valid. Check the punctuation.');
        return;
      }
    }

    if (reviewed) body.reviewed = true;

    await onSave(() => api.patch(`/questions/${question.id}`, body), 'Question saved.');
    onDone();
  }

  return (
    <div className="stack" style={{ marginTop: '.75rem' }}>
      {problem && (
        <p className="alert error" role="alert">
          {problem}
        </p>
      )}

      <label>
        Question
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          aria-label="Question text"
          data-testid="edit-prompt"
        />
      </label>

      {isChoiceKind && (
        <ChoiceFields
          choices={choices}
          correct={correct}
          name={question.id}
          onChange={setChoices}
          onCorrect={setCorrect}
        />
      )}

      {isMatching && <PairFields pairs={pairs} onChange={setPairs} />}

      {isOrdering && <SentenceField value={sentence} onChange={setSentence} />}

      {isTrueFalse && (
        <fieldset className="fieldset">
          <legend>The correct answer</legend>
          <div className="row">
            {[true, false].map((value) => (
              <label key={String(value)} className="row" style={{ gap: '.4rem' }}>
                <input
                  type="radio"
                  name={`tf-${question.id}`}
                  checked={trueFalse === value}
                  onChange={() => setTrueFalse(value)}
                  data-testid={`edit-tf-${value}`}
                />
                {value ? 'True' : 'False'}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {isTyped && (
        <label>
          Answers you will accept — one per line
          <textarea
            rows={3}
            value={accepted}
            onChange={(e) => setAccepted(e.target.value)}
            data-testid="edit-accepted"
          />
        </label>
      )}

      {needsRawKey && (
        <label>
          Answer
          <textarea
            rows={3}
            value={rawKey}
            onChange={(e) => setRawKey(e.target.value)}
            aria-label="Answer key"
            data-testid="edit-answer-key"
            style={{ fontFamily: 'monospace' }}
          />
        </label>
      )}

      <div className="row">
        <label style={{ maxWidth: '8rem' }}>
          Marks
          <input
            type="number"
            min={1}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            aria-label="Marks for this question"
          />
        </label>

        <SectionPicker sections={sections} value={sectionId} onChange={setSectionId} />
      </div>

      <QuestionPicture question={question} onSave={onSave} />

      {question.needsReview && (
        <label className="row" style={{ gap: '.4rem' }}>
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
            data-testid="mark-reviewed"
          />
          I have checked this question — it can be published
        </label>
      )}

      <div className="row">
        <button onClick={submit} data-testid="save-question">
          Save
        </button>
        <button onClick={onDone}>Cancel</button>
        {question.status === 'PUBLISHED' ? (
          <button
            className="small"
            onClick={() =>
              onSave(
                () => api.post(`/questions/${question.id}/status`, { status: 'DRAFT' }),
                'Question hidden from students.',
              )
            }
          >
            Hide from students
          </button>
        ) : (
          <button
            className="small"
            data-testid="publish-question"
            onClick={() =>
              onSave(
                () => api.post(`/questions/${question.id}/status`, { status: 'PUBLISHED' }),
                'Question published.',
              )
            }
          >
            Publish to students
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A picture on a question.
 *
 * The file is read in the browser and sent as text, the same way a grammar
 * section's scan is. A picture already on a question shows above; this is how
 * she adds or replaces one.
 */
function QuestionPicture({
  question,
  onSave,
}: {
  question: Question;
  onSave: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function upload(file: File) {
    setProblem(null);
    setBusy(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(file);
      });

      await onSave(
        () =>
          api.post(`/content/questions/${question.id}/images`, {
            data,
            mimeType: file.type,
            altText: `Picture for: ${question.prompt.slice(0, 80)}`,
          }),
        'Picture added.',
      );
    } catch (caught) {
      setProblem(caught instanceof ApiError ? caught.message : 'That picture could not be added.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: '.4rem' }}>
      {problem && (
        <p className="alert error" role="alert">
          {problem}
        </p>
      )}

      <label>
        Picture for this question
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
          data-testid="question-image-upload"
        />
      </label>

      {(question.media?.length ?? 0) > 0 && (
        <div className="row">
          {question.media?.map((file) => (
            <button
              key={file.id}
              className="small danger"
              onClick={() =>
                onSave(() => api.del(`/content/media/${file.id}`), 'Picture removed.')
              }
              data-testid="remove-question-image"
            >
              Remove picture
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
