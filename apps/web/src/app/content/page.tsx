'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, FormEvent } from 'react';
import { api, ApiError, homeFor, Me, UnitSummary } from '@/lib/api';

/**
 * The curriculum, as the teacher manages it.
 *
 * Nothing here writes teaching content on its own: the teacher enters it and
 * approves it. Everything stays a draft, invisible to students, until she
 * publishes it (SRS 32, 37.7).
 */
export default function ContentPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [units, setUnits] = useState<UnitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUnits(await api.get<UnitSummary[]>('/content/units'));
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.push('/login');
        return;
      }
      setError(caught instanceof ApiError ? caught.message : 'Could not load the curriculum.');
    } finally {
      setLoading(false);
    }
  }, [router]);

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

  async function publish(unit: UnitSummary) {
    setBusyId(unit.id);
    setError(null);
    setNotice(null);

    try {
      const result = await api.post<{ sections: number; words: number }>(
        `/content/units/${unit.id}/publish`,
      );
      setNotice(
        `${unit.title} is now visible to students — ${result.sections} sections and ${result.words} words.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not publish.');
    } finally {
      setBusyId(null);
    }
  }

  async function unpublish(unit: UnitSummary) {
    setBusyId(unit.id);
    try {
      await api.post(`/content/units/${unit.id}/status`, { status: 'DRAFT' });
      setNotice(`${unit.title} is hidden from students again.`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not change this.');
    } finally {
      setBusyId(null);
    }
  }

  if (!me) return <main className="page"><p className="muted">Loading…</p></main>;

  return (
    <main className="page stack">
      <div className="between">
        <div>
          <h1>Curriculum</h1>
          <p className="muted">TOP GOAL — signed in as {me.displayName}</p>
        </div>
        <div className="row">
          <button onClick={() => router.push('/students')}>My students</button>
        </div>
      </div>

      {error && <p className="alert error" role="alert">{error}</p>}
      {notice && <p className="alert ok" role="status">{notice}</p>}

      <p className="alert warn">
        New and imported material stays a <strong>draft</strong> and is invisible to students until
        you publish it. Review each unit before publishing.
      </p>

      <AddUnitForm onAdded={(t) => { setNotice(`${t} was added as a draft.`); void load(); }} onError={setError} />

      <div className="card">
        <h2>{units.length} unit{units.length === 1 ? '' : 's'}</h2>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : units.length === 0 ? (
          <p className="muted">No units yet. Add the first one above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Contents</th>
                  <th>Visible to students</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit.id}>
                    <td>
                      {unit.title}
                      {unit.kind && <span className="muted"> · {unit.kind}</span>}
                    </td>
                    <td className="muted" data-label="Contents">
                      {unit._count.sections} sections, {unit._count.vocabularyItems} words
                    </td>
                    <td data-label="Visible to students">
                      {unit.status === 'PUBLISHED' ? (
                        <span className="badge active">Published</span>
                      ) : (
                        <span className="badge disabled">Draft</span>
                      )}
                    </td>
                    <td>
                      <div className="row">
                        <button className="small" onClick={() => router.push(`/content/${unit.id}`)}>
                          Open
                        </button>
                        {unit.status === 'PUBLISHED' ? (
                          <button className="small" disabled={busyId === unit.id} onClick={() => unpublish(unit)}>
                            Hide from students
                          </button>
                        ) : (
                          <button className="small primary" disabled={busyId === unit.id} onClick={() => publish(unit)}>
                            Publish
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function AddUnitForm({
  onAdded,
  onError,
}: {
  onAdded: (title: string) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post('/content/units', { title, ...(kind.trim() ? { kind: kind.trim() } : {}) });
      onAdded(title);
      setTitle('');
      setKind('');
      setOpen(false);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'Could not add the unit.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button className="primary" onClick={() => setOpen(true)}>Add a unit</button>;

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>Add a unit</h2>
      <label htmlFor="unitTitle">Title</label>
      <input id="unitTitle" value={title} onChange={(e) => setTitle(e.target.value)} required />

      <label htmlFor="unitKind">Kind (optional)</label>
      <input id="unitKind" value={kind} onChange={(e) => setKind(e.target.value)} />
      <p className="muted">
        Leave empty for a normal unit. Use it to mark material that is not one, such as
        &ldquo;Welcome&rdquo; or &ldquo;Review&rdquo;.
      </p>

      <div className="row" style={{ marginTop: '1.25rem' }}>
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add unit'}</button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
