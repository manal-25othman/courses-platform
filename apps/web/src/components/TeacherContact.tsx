'use client';

import { MyTeacher } from '@/lib/api';
import { Icon } from './Icon';

/**
 * Who her teacher is, and the way to reach her outside the platform.
 *
 * Everything shown here comes from `/teachers/mine`, which answers only for
 * the teacher this student is actually assigned to, inside her own school.
 * There is no phone number in this file and none in any other file in the
 * web app: the API hands back a finished `wa.me` address or nothing at all,
 * so a number cannot leak through the client even by accident.
 *
 * Three states, because all three really happen:
 *
 *   no teacher assigned    — said plainly, so she knows it is not broken
 *   assigned, no number    — her name, and the way that does work instead
 *   assigned, with number  — her name, and the button
 *
 * The third is the only one that renders a link. A missing number never
 * produces a button that goes nowhere.
 */
export function TeacherContact({
  teacher,
  studentName,
  className,
}: {
  /** `null` while loading or when she has no teacher assigned. */
  teacher: MyTeacher | null;
  /** Used only to sign the opening line of the message. */
  studentName: string;
  className?: string;
}) {
  if (!teacher) {
    return (
      <section className={`teacher-card${className ? ` ${className}` : ''}`} data-state="none">
        <span className="teacher-face" aria-hidden="true">
          <Icon name="teacher" size={22} />
        </span>
        <div className="teacher-words">
          <p className="teacher-label">Your English Teacher</p>
          <p className="teacher-name">Not assigned yet</p>
          <p className="teacher-note">
            Your school has not linked you to a teacher yet. It will appear here as soon as it does.
          </p>
        </div>
      </section>
    );
  }

  const fullName = `${teacher.title ? `${teacher.title} ` : ''}${teacher.displayName}`;
  // Short, friendly, and it says who is writing — she is messaging from a
  // number her teacher may not have saved.
  const hello = `Hello ${fullName}, this is ${studentName} from TOP GOAL 3. I have a question about my English lesson.`;

  return (
    <section
      className={`teacher-card${className ? ` ${className}` : ''}`}
      data-state={teacher.whatsappUrl ? 'ready' : 'no-number'}
    >
      <span className="teacher-face" aria-hidden="true">
        <Icon name="teacher" size={22} />
      </span>

      <div className="teacher-words">
        <p className="teacher-label">Your English Teacher</p>
        <p className="teacher-name">{fullName}</p>
        {!teacher.whatsappUrl && (
          <p className="teacher-note" data-testid="whatsapp-unavailable">
            WhatsApp is not set up yet. Use Messages to write to her inside TOP GOAL.
          </p>
        )}
      </div>

      {teacher.whatsappUrl && (
        <a
          className="wa-button"
          href={`${teacher.whatsappUrl}?text=${encodeURIComponent(hello)}`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="whatsapp-button"
        >
          <Icon name="whatsapp" size={20} />
          <span>Message Your Teacher</span>
          {/* Said once, for anyone who cannot see the icon. */}
          <span className="sr-only"> on WhatsApp (opens in a new tab)</span>
        </a>
      )}
    </section>
  );
}
