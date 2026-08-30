'use client';

import { api, LearnSection } from '@/lib/api';

/**
 * The teaching parts of a unit: grammar, reading, writing.
 *
 * There is nothing to answer here, so opening one is all there is to record.
 * Whether a section counts towards her progress is decided by the section's
 * own type — data set by the teacher, not a rule written into this screen.
 */
export function ReadingSections({
  sections,
  onChanged,
}: {
  sections: LearnSection[];
  onChanged: () => Promise<void> | void;
}) {
  if (sections.length === 0) {
    return (
      <div className="card">
        <p className="muted">There are no lessons in this unit yet.</p>
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
              {section.type.isPaperBased && (
                <span className="badge disabled">Do this on paper</span>
              )}
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

          {section.type.isPaperBased && (
            <p className="muted" style={{ margin: 0 }}>
              This one is practised in your exercise book. It is here so you can see what to do.
            </p>
          )}

          {section.body ? (
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{section.body}</p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Your teacher has not added the text for this lesson yet.
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
