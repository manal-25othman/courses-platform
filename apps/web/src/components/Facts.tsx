import type { ReactNode } from 'react';

/**
 * A few figures under a page heading.
 *
 * Read as a line of facts, not a row of tiles: the number is set in the
 * display face and the word under it says what it counts. Anything here
 * comes from data the page already holds — nothing is fetched for it.
 */
export function Facts({
  items,
}: {
  items: { value: ReactNode; label: string; tone?: 'ok' | 'warn' }[];
}) {
  return (
    <dl className="facts">
      {items.map((item) => (
        <div className="fact" key={item.label} data-tone={item.tone}>
          <dd>{item.value}</dd>
          <dt>{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}
