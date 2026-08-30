'use client';

import { api, LearnSection } from '@/lib/api';

/**
 * The grammar for a unit.
 *
 * There is nothing to answer here, so reading one is all there is to record.
 * The API sends only the sections that belong in her flow, so this screen has
 * no filtering to get wrong.
 */
export function GrammarSections({
  sections,
  onChanged,
}: {
  sections: LearnSection[];
  onChanged: () => Promise<void> | void;
}) {
  if (sections.length === 0) {
    return (
      <div className="card">
        <p className="muted">Your teacher has not added the grammar for this unit yet.</p>
      </div>
    );
  }

  async function markViewed(section: LearnSection) {
    if (section.viewed) return;
    await api.post(`/learn/sections/${section.id}/viewed`).catch(() => undefined);
    await onChanged();
  }

  return (
    <div className="stack">
      {sections.map((section) => (
        <div key={section.id} className="card stack" data-testid="section-card">
          <div className="between">
            <div>
              <strong>{section.title ?? section.type.displayName}</strong>{' '}
              <span className="muted">· {section.type.displayName}</span>
            </div>
            <div className="row">
              {section.viewed ? (
                <span className="badge active" data-testid="section-read">
                  Read
                </span>
              ) : (
                <button
                  className="small"
                  onClick={() => markViewed(section)}
                  data-testid="mark-read"
                >
                  Mark as read
                </button>
              )}
            </div>
          </div>

          {section.body ? (
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{section.body}</p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Your teacher has not added the text for this grammar lesson yet.
            </p>
          )}

          {section.media.map((image) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={image.id} src={image.url} alt={image.altText ?? ''} />
          ))}
        </div>
      ))}
    </div>
  );
}
