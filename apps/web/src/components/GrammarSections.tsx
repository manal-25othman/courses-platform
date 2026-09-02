'use client';

import { api, apiUrl, LearnSection } from '@/lib/api';
import { Icon } from './Icon';

/**
 * One worked example.
 *
 * Most grammar examples in this course are transformations: the teacher writes
 * the original, an arrow, then the result. Splitting on the arrow lets the
 * result be marked — which is what the pen would do on paper — instead of the
 * pair arriving as one undifferentiated line of text.
 *
 * The split is on the text as the teacher wrote it. An example with no arrow
 * is not a transformation and is left exactly as it is.
 */
function Example({ text }: { text: string }) {
  const at = text.search(/[→>]{1,2}|=>/);
  const arrow = text.match(/→|=>|-->|->/);
  if (at < 0 || !arrow) {
    return (
      <li className="example plain">
        <span className="to">{text}</span>
      </li>
    );
  }
  const from = text.slice(0, at).trim();
  const to = text.slice(at + arrow[0].length).trim();
  return (
    <li className="example">
      <span className="from">{from}</span>
      <span className="to">{to}</span>
    </li>
  );
}

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
      <div className="locked-note">
        <Icon name="grammar" />
        <div>
          <strong>No grammar here yet</strong>
          <p className="muted" style={{ margin: '.25rem 0 0' }}>
            Your teacher is still writing this part. The words and the activity are ready now.
          </p>
        </div>
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
        <article key={section.id} className="lesson" data-testid="section-card">
          <div className="lesson-head">
            {/* The tab already says Grammar; repeating the type here would tell
                her nothing she cannot see. Only the lesson's own name is set. */}
            <h2 className="marked-title" style={{ margin: 0 }}>
              {section.title ?? section.type.displayName}
            </h2>
            {section.viewed ? (
              <span className="read-state" data-testid="section-read">
                <span className="mark tick" aria-hidden="true">
                  <Icon name="tick" />
                </span>
                Read
              </span>
            ) : null}
          </div>

          {section.body ? (
            <div className="lesson-body">{section.body}</div>
          ) : (
            <div className="lesson-body">
              <span className="muted">
                Your teacher has not written this lesson yet.
              </span>
            </div>
          )}

          {section.video && (
            <div className="video-frame" data-testid="grammar-video">
              <iframe
                src={section.video.embedUrl}
                title={`Video: ${section.title ?? 'grammar'}`}
                // The address comes from the API, which built it from parts it
                // parsed itself. The sandbox is the second line: even so, the
                // frame gets only what a player needs and nothing else.
                sandbox="allow-scripts allow-same-origin allow-presentation"
                allow="encrypted-media; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                loading="lazy"
                allowFullScreen
              />
            </div>
          )}

          {section.media.map((image) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={image.id}
              src={apiUrl(image.url)}
              alt={image.altText ?? ''}
              data-testid="grammar-image"
              style={{ display: 'block', width: '100%' }}
            />
          ))}

          {section.examples.length > 0 && (
            <ul className="examples-set" data-testid="grammar-examples">
              {section.examples.map((example, i) => (
                <Example key={i} text={example} />
              ))}
            </ul>
          )}

          {!section.viewed && (
            <div style={{ padding: 'var(--s4) var(--s5) var(--s5)' }}>
              <button className="primary" onClick={() => markViewed(section)} data-testid="mark-read">
                I have read this
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
