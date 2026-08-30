'use client';

import { useParams, useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useState, FormEvent } from 'react';
import { api, ApiError, homeFor, Me, Section, SectionType, UnitDetail, VocabularyItem } from '@/lib/api';
import { QuestionList } from '@/components/QuestionList';

/** One unit: its sections and its word list. */
export default function UnitPage() {
  const router = useRouter();
  const params = useParams<{ unitId: string }>();
  const unitId = params.unitId;

  const [me, setMe] = useState<Me | null>(null);
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [types, setTypes] = useState<SectionType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, sectionTypes] = await Promise.all([
        api.get<UnitDetail>(`/content/units/${unitId}`),
        api.get<SectionType[]>('/content/section-types'),
      ]);
      setUnit(detail);
      setTypes(sectionTypes);
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.push('/login');
        return;
      }
      setError(caught instanceof ApiError ? caught.message : 'Could not load this unit.');
    }
  }, [unitId, router]);

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((user) => {
        if (user.role === 'STUDENT' || user.mustChangePassword) {
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

  async function run(work: () => Promise<unknown>, message: string) {
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice(message);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not work.');
    }
  }

  if (!me || !unit) {
    return (
      <main className="page">
        {error ? <p className="alert error">{error}</p> : <p className="muted">Loading…</p>}
      </main>
    );
  }

  return (
    <main className="page stack">
      <div className="between">
        <div>
          <h1>{unit.title}</h1>
          <p className="muted">
            {unit.kind ? `${unit.kind} · ` : ''}
            {unit.status === 'PUBLISHED' ? 'Visible to students' : 'Draft — not visible to students'}
          </p>
        </div>
        <button onClick={() => router.push('/content')}>Back to curriculum</button>
      </div>

      {error && <p className="alert error" role="alert">{error}</p>}
      {notice && <p className="alert ok" role="status">{notice}</p>}

      <SectionList
        unit={unit}
        types={types}
        onRun={run}
      />

      <VocabularyList unit={unit} onRun={run} />

      <QuestionList unitId={unit.id} onRun={run} />
    </main>
  );
}

function SectionList({
  unit,
  types,
  onRun,
}: {
  unit: UnitDetail;
  types: SectionType[];
  onRun: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState<Section | null>(null);

  return (
    <div className="card stack">
      <div className="between">
        <h2 style={{ margin: 0 }}>Sections ({unit.sections.length})</h2>
        <div className="row">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            style={{ padding: '.5rem', borderRadius: 8, border: '1px solid var(--border)' }}
            aria-label="Section type to add"
          >
            <option value="">Add a section…</option>
            {types.map((t) => (
              <option key={t.key} value={t.key}>
                {t.orderIndex}. {t.displayName}
              </option>
            ))}
          </select>
          <button
            disabled={!adding}
            onClick={() => {
              const key = adding;
              setAdding('');
              void onRun(
                () => api.post(`/content/units/${unit.id}/sections`, { typeKey: key }),
                'Section added as a draft.',
              );
            }}
          >
            Add
          </button>
        </div>
      </div>

      {unit.sections.length === 0 ? (
        <p className="muted">No sections yet. Choose a type above to add one.</p>
      ) : (
        unit.sections.map((section) => (
          <div key={section.id} className="card" style={{ background: 'var(--bg)' }}>
            <div className="between">
              <div>
                <strong>{section.title ?? section.type.displayName}</strong>{' '}
                <span className="muted">· {section.type.displayName}</span>
                {section.type.isPaperBased && (
                  <span className="badge disabled" style={{ marginLeft: '.5rem' }}>
                    Done on paper
                  </span>
                )}
              </div>
              <div className="row">
                <span className={`badge ${section.status === 'PUBLISHED' ? 'active' : 'disabled'}`}>
                  {section.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                </span>
                <button className="small" onClick={() => setEditing(editing?.id === section.id ? null : section)}>
                  {editing?.id === section.id ? 'Close' : 'Edit'}
                </button>
                <button
                  className="small danger"
                  onClick={() =>
                    onRun(() => api.del(`/content/sections/${section.id}`), 'Section removed.')
                  }
                >
                  Remove
                </button>
              </div>
            </div>

            {section.type.isPaperBased && (
              <p className="muted" style={{ marginTop: '.5rem' }}>
                This kind of practice is done on paper. It is shown to students for reference and
                is not answered on screen.
              </p>
            )}

            {editing?.id === section.id ? (
              <SectionEditor
                section={section}
                onCancel={() => setEditing(null)}
                onSave={(title, body) =>
                  onRun(
                    () => api.patch(`/content/sections/${section.id}`, { title, body }),
                    'Section saved.',
                  ).then(() => setEditing(null))
                }
              />
            ) : (
              section.body && (
                <p style={{ whiteSpace: 'pre-wrap', marginTop: '.5rem' }}>{section.body}</p>
              )
            )}
          </div>
        ))
      )}
    </div>
  );
}

function SectionEditor({
  section,
  onSave,
  onCancel,
}: {
  section: Section;
  onSave: (title: string, body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(section.title ?? '');
  const [body, setBody] = useState(section.body ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await onSave(title, body);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} style={{ marginTop: '.75rem' }}>
      <label htmlFor={`t-${section.id}`}>Title</label>
      <input id={`t-${section.id}`} value={title} onChange={(e) => setTitle(e.target.value)} />

      <label htmlFor={`b-${section.id}`}>Content</label>
      <textarea
        id={`b-${section.id}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        style={{
          width: '100%',
          padding: '.6rem .7rem',
          fontSize: '1rem',
          fontFamily: 'inherit',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}
      />
      <p className="muted">
        Enter the material exactly as it appears in the curriculum. Do not reword or correct it.
      </p>

      <div className="row" style={{ marginTop: '.75rem' }}>
        <button className="primary small" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="small" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function VocabularyList({
  unit,
  onRun,
}: {
  unit: UnitDetail;
  onRun: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await onRun(
      () =>
        api.post(`/content/units/${unit.id}/vocabulary`, {
          wordEn: word,
          ...(meaning.trim() ? { meaningAr: meaning.trim() } : {}),
        }),
      `"${word}" was added.`,
    );
    setWord('');
    setMeaning('');
    setBusy(false);
  }

  return (
    <div className="card">
      <h2>Vocabulary ({unit.vocabularyItems.length})</h2>

      <form onSubmit={add} className="row" style={{ alignItems: 'flex-end', gap: '.5rem' }}>
        <div style={{ flex: '1 1 10rem' }}>
          <label htmlFor="wordEn">English word</label>
          <input id="wordEn" value={word} onChange={(e) => setWord(e.target.value)} required />
        </div>
        <div style={{ flex: '1 1 10rem' }}>
          <label htmlFor="meaningAr">Arabic meaning</label>
          {/* The meaning is Arabic, so this field reads right-to-left while the
              rest of the interface stays English (SRS 39). */}
          <input
            id="meaningAr"
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            dir="rtl"
            lang="ar"
          />
        </div>
        <button className="primary" type="submit" disabled={busy || !word.trim()}>
          {busy ? 'Adding…' : 'Add word'}
        </button>
      </form>

      {unit.vocabularyItems.length > 0 && (
        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table>
            <thead>
              <tr>
                <th>English</th>
                <th>Arabic</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {unit.vocabularyItems.map((item: VocabularyItem) => (
                <Fragment key={item.id}>
                  <tr>
                    <td>{item.wordEn}</td>
                    <td data-label="Arabic" dir="rtl" lang="ar">
                      {item.meaningAr ?? '—'}
                    </td>
                    <td data-label="Status">
                      <span
                        className={`badge ${item.status === 'PUBLISHED' ? 'active' : 'disabled'}`}
                      >
                        {item.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td>
                      <div className="row">
                        <button
                          className="small"
                          data-testid={`edit-word-${item.wordEn}`}
                          aria-label={`Edit the word ${item.wordEn}`}
                          onClick={() => setEditing(editing === item.id ? null : item.id)}
                        >
                          {editing === item.id ? 'Close' : 'Edit'}
                        </button>
                        <button
                          className="small danger"
                          onClick={() =>
                            onRun(
                              () => api.del(`/content/vocabulary/${item.id}`),
                              `"${item.wordEn}" was removed.`,
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editing === item.id && (
                    <tr>
                      <td colSpan={4}>
                        <WordEditor
                          item={item}
                          onCancel={() => setEditing(null)}
                          onSave={(changes) =>
                            onRun(
                              () => api.patch(`/content/vocabulary/${item.id}`, changes),
                              'Word saved.',
                            ).then(() => setEditing(null))
                          }
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Correcting a word that is already in the list.
 *
 * Every field the word has, so a spelling or a meaning can be fixed in place.
 * Deleting and retyping was the only way before, and that threw away the
 * progress students had recorded against the word.
 */
function WordEditor({
  item,
  onSave,
  onCancel,
}: {
  item: VocabularyItem;
  onSave: (changes: Record<string, string | null>) => Promise<void>;
  onCancel: () => void;
}) {
  const [wordEn, setWordEn] = useState(item.wordEn);
  const [meaningAr, setMeaningAr] = useState(item.meaningAr ?? '');
  const [partOfSpeech, setPartOfSpeech] = useState(item.partOfSpeech ?? '');
  const [exampleSentence, setExampleSentence] = useState(item.exampleSentence ?? '');
  const [saving, setSaving] = useState(false);

  const trimmed = (value: string) => (value.trim() === '' ? null : value.trim());

  async function save() {
    setSaving(true);
    await onSave({
      wordEn: wordEn.trim(),
      meaningAr: trimmed(meaningAr),
      partOfSpeech: trimmed(partOfSpeech),
      exampleSentence: trimmed(exampleSentence),
    });
    setSaving(false);
  }

  return (
    <div className="stack" data-testid="word-editor">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 10rem' }}>
          <label htmlFor={`w-${item.id}`}>English word</label>
          <input
            id={`w-${item.id}`}
            value={wordEn}
            onChange={(e) => setWordEn(e.target.value)}
            data-testid="edit-wordEn"
          />
        </div>
        <div style={{ flex: '1 1 10rem' }}>
          <label htmlFor={`m-${item.id}`}>Arabic meaning</label>
          {/* Arabic reads right-to-left; the interface around it stays English. */}
          <input
            id={`m-${item.id}`}
            value={meaningAr}
            onChange={(e) => setMeaningAr(e.target.value)}
            dir="rtl"
            lang="ar"
            data-testid="edit-meaningAr"
          />
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 8rem' }}>
          <label htmlFor={`p-${item.id}`}>Part of speech</label>
          <input
            id={`p-${item.id}`}
            value={partOfSpeech}
            onChange={(e) => setPartOfSpeech(e.target.value)}
            placeholder="noun, verb, adjective…"
            data-testid="edit-partOfSpeech"
          />
        </div>
        <div style={{ flex: '2 1 14rem' }}>
          <label htmlFor={`e-${item.id}`}>Example sentence</label>
          <input
            id={`e-${item.id}`}
            value={exampleSentence}
            onChange={(e) => setExampleSentence(e.target.value)}
            data-testid="edit-exampleSentence"
          />
        </div>
      </div>

      <p className="muted" style={{ margin: 0 }}>
        Enter the material exactly as it appears in the curriculum. Do not reword or correct it.
      </p>

      <div className="row">
        <button
          className="primary"
          onClick={save}
          disabled={saving || wordEn.trim() === ''}
          data-testid="save-word"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
