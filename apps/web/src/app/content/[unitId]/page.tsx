'use client';

import { useParams, useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useState, FormEvent } from 'react';
import {
  api,
  ApiError,
  apiUrl,
  homeFor,
  Me,
  Section,
  SectionType,
  UnitDetail,
  VocabularyItem,
} from '@/lib/api';
import { QuestionList } from '@/components/QuestionList';

type Tab = 'vocabulary' | 'grammar' | 'activities' | 'assessment';

/**
 * One unit, in the four parts a student meets it in.
 *
 * They used to be one long page. Splitting them means a teacher preparing the
 * word list is not scrolling past every question to reach it, and — more to
 * the point — that the unit's assessment is a place of its own rather than
 * questions mixed in with the practice ones.
 */
export default function UnitPage() {
  const router = useRouter();
  const params = useParams<{ unitId: string }>();
  const unitId = params.unitId;

  const [me, setMe] = useState<Me | null>(null);
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [types, setTypes] = useState<SectionType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('vocabulary');

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

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'vocabulary'}
          onClick={() => setTab('vocabulary')}
          data-testid="cms-tab-vocabulary"
        >
          Vocabulary ({unit.vocabularyItems.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === 'grammar'}
          onClick={() => setTab('grammar')}
          data-testid="cms-tab-grammar"
        >
          Grammar ({unit.sections.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === 'activities'}
          onClick={() => setTab('activities')}
          data-testid="cms-tab-activities"
        >
          Activities
        </button>
        <button
          role="tab"
          aria-selected={tab === 'assessment'}
          onClick={() => setTab('assessment')}
          data-testid="cms-tab-assessment"
        >
          Assessment
        </button>
      </div>

      {tab === 'vocabulary' && <VocabularyList unit={unit} onRun={run} />}

      {tab === 'grammar' && <SectionList unit={unit} types={types} onRun={run} />}

      {/*
        The same editor serves both, filtered by what the question is for.
        Practice and assessment questions differ in nothing a teacher writes —
        the wording, the choices, the marking are identical — so one editor
        with a filter is one place to fix a bug rather than two.
      */}
      {tab === 'activities' && (
        <QuestionList
          key="activities"
          unitId={unit.id}
          purpose="ACTIVITY"
          sections={unit.sections}
          onRun={run}
        />
      )}

      {tab === 'assessment' && (
        <QuestionList
          key="assessment"
          unitId={unit.id}
          purpose="ASSESSMENT"
          sections={unit.sections}
          onRun={run}
        />
      )}
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
          <div
            key={section.id}
            className="card"
            style={{ background: 'var(--bg)' }}
            data-section-id={section.id}
            data-section-type={section.typeKey}
          >
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
                onChanged={() => onRun(async () => undefined, 'Picture updated.')}
                onSave={(changes) =>
                  onRun(
                    () => api.patch(`/content/sections/${section.id}`, changes),
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
  onChanged,
}: {
  section: Section;
  onSave: (changes: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  onChanged: () => Promise<void>;
}) {
  const [title, setTitle] = useState(section.title ?? '');
  const [body, setBody] = useState(section.body ?? '');
  // One example per line, which is how a teacher would type a list.
  const [examples, setExamples] = useState((section.examples ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await onSave({
      title,
      body,
      examples: examples
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    });
    setBusy(false);
  }

  /**
   * Attaches a picture.
   *
   * Read in the browser and sent as text, so there is no upload endpoint of a
   * different shape to secure separately. What may be sent, and how large, is
   * decided by the API — this only reports what it says.
   */
  async function upload(file: File) {
    setProblem(null);
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });

      await api.post(`/content/sections/${section.id}/images`, {
        data,
        mimeType: file.type,
        altText: file.name.replace(/\.[^.]+$/, ''),
      });
      await onChanged();
    } catch (caught) {
      setProblem(
        caught instanceof ApiError ? caught.message : 'That picture could not be added.',
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: '.75rem' }}>
      {problem && (
        <p className="alert error" role="alert">
          {problem}
        </p>
      )}

      <label htmlFor={`t-${section.id}`}>Title</label>
      <input
        id={`t-${section.id}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        data-testid="section-title"
      />

      <label htmlFor={`b-${section.id}`}>Explanation</label>
      <textarea
        id={`b-${section.id}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        data-testid="section-body"
      />

      <label htmlFor={`x-${section.id}`}>Examples — one per line</label>
      <textarea
        id={`x-${section.id}`}
        value={examples}
        onChange={(e) => setExamples(e.target.value)}
        rows={4}
        data-testid="section-examples"
      />

      <label htmlFor={`i-${section.id}`}>Picture (optional)</label>
      <input
        id={`i-${section.id}`}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        disabled={uploading}
        data-testid="section-image"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
      <p className="muted">
        PNG, JPEG, WEBP or GIF, up to 2 MB. Much of this curriculum is pictures, so a grammar
        page can be a scan of the page from the book.
      </p>

      {section.media.length > 0 && (
        <div className="row" style={{ marginTop: '.5rem' }}>
          {section.media.map((image) => (
            <div key={image.id} className="stack" style={{ gap: '.3rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={apiUrl(image.url)}
                alt={image.altText ?? ''}
                data-testid="section-image-preview"
                style={{ maxWidth: '10rem', borderRadius: 6, border: '1px solid var(--border)' }}
              />
              <button
                type="button"
                className="small danger"
                data-testid="remove-image"
                onClick={async () => {
                  await api.del(`/content/images/${image.id}`).catch(() => undefined);
                  await onChanged();
                }}
              >
                Remove picture
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="muted">
        Enter the material exactly as it appears in the curriculum. Do not reword or correct it.
      </p>

      <div className="row">
        <button className="primary" type="submit" disabled={busy} data-testid="save-section">
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>
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
                          onRun={onRun}
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
  onRun,
}: {
  item: VocabularyItem;
  onSave: (changes: Record<string, string | null>) => Promise<void>;
  onCancel: () => void;
  onRun: (work: () => Promise<unknown>, message: string) => Promise<void>;
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

      <WordMedia item={item} onRun={onRun} />

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

/**
 * A picture and a recording for one word.
 *
 * The recording is the fallback for a browser whose own voice does not work.
 * It never lets a student say she has heard a word — she still has to play it
 * (client, 2026-08-31) — so recording one adds a way through rather than a way
 * round.
 */
function WordMedia({
  item,
  onRun,
}: {
  item: VocabularyItem;
  onRun: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const media = item.media ?? [];
  const recording = media.find((m) => m.mimeType?.startsWith('audio/'));
  const picture = media.find((m) => m.mimeType?.startsWith('image/'));

  async function upload(file: File, what: string) {
    setBusy(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(file);
      });

      await onRun(
        () =>
          api.post(`/content/vocabulary/${item.id}/media`, {
            data,
            mimeType: file.type,
            altText: `${what} for ${item.wordEn}`,
          }),
        `${what} added.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 12rem' }}>
        <label htmlFor={`audio-${item.id}`}>Your recording of this word</label>
        <input
          id={`audio-${item.id}`}
          type="file"
          accept="audio/*"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file, 'Recording');
            e.target.value = '';
          }}
          data-testid="word-audio-upload"
        />
        {recording && (
          <div className="row" style={{ marginTop: '.4rem' }}>
            {/* A recording of one word: there is nothing to caption. */}
            <audio controls src={apiUrl(recording.url)} data-testid="word-audio" />
            <button
              className="small danger"
              onClick={() => onRun(() => api.del(`/content/media/${recording.id}`), 'Recording removed.')}
            >
              Remove
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: '1 1 12rem' }}>
        <label htmlFor={`pic-${item.id}`}>Picture for this word</label>
        <input
          id={`pic-${item.id}`}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file, 'Picture');
            e.target.value = '';
          }}
          data-testid="word-picture-upload"
        />
        {picture && (
          <div className="row" style={{ marginTop: '.4rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={apiUrl(picture.url)} alt={`A picture of ${item.wordEn}`} className="word-picture" />
            <button
              className="small danger"
              onClick={() => onRun(() => api.del(`/content/media/${picture.id}`), 'Picture removed.')}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
