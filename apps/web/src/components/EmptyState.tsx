import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * A screen with nothing on it yet.
 *
 * An empty roster or an empty course is a beginning, not a fault, so it is
 * drawn as an invitation: three of the product's own marks, a plain statement
 * of what is missing, and the one action that fills it. Used wherever a
 * teacher meets an empty list, so the four screens say it the same way.
 */
export function EmptyState({
  icons = ['words', 'grammar', 'activity'],
  title,
  children,
  action,
}: {
  /** The three marks in the cluster, left to right. */
  icons?: [IconName, IconName, IconName];
  title: string;
  /** One or two sentences: what is missing and what fills it. */
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="blank">
      <span className="blank-art" aria-hidden="true">
        <span data-kind="vocabulary"><Icon name={icons[0]} size={18} /></span>
        <span data-kind="activity"><Icon name={icons[1]} size={20} /></span>
        <span data-kind="grammar"><Icon name={icons[2]} size={18} /></span>
      </span>
      <strong>{title}</strong>
      <p>{children}</p>
      {action}
    </div>
  );
}
