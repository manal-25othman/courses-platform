'use client';

import { useId, useState } from 'react';
import { Icon, IconName } from './Icon';

/**
 * A password box you can look at.
 *
 * Typing a password you cannot see is hard for anyone and harder on a phone
 * keyboard, and this product asks people to type one at the worst moments: a
 * teacher signing in between lessons, a girl setting her first password on a
 * shared tablet with her class watching. Both cases want the same thing --
 * check what I typed, then hide it again.
 *
 * Three rules it keeps:
 *
 *   Hidden unless asked. It starts as a password box and returns to one on
 *   every new render of a new field. Nothing reveals it but a deliberate
 *   press, and nothing remembers that the press happened: the choice is not
 *   stored, so it cannot survive into a session the person did not mean it to.
 *
 *   The value is never touched. Only the input's `type` changes, so the
 *   caret, the selection and half-typed text all survive being looked at.
 *   Swapping one input for another would lose them.
 *
 *   It is a button, not a decoration. Reachable by keyboard, labelled for a
 *   screen reader, and big enough for a thumb -- 44px, which is the smallest
 *   target a child reliably hits.
 *
 * The password itself is passed straight to the caller's state and never to
 * storage or a log. This component holds one boolean and nothing else.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  hint,
  autoFocus,
  testId,
  icon,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Tells the browser which password this is, so it offers the right one. */
  autoComplete: 'current-password' | 'new-password';
  required?: boolean;
  minLength?: number;
  /** Shown under the box — a rule to meet, not an error. */
  hint?: string;
  autoFocus?: boolean;
  testId?: string;
  /** A mark inside the box, at the leading edge. */
  icon?: IconName;
  /**
   * Shown while the box is empty. The label stays in the markup either way --
   * a placeholder disappears the moment somebody types, so it can decorate a
   * field but it cannot name one.
   */
  placeholder?: string;
}) {
  const [shown, setShown] = useState(false);
  const hintId = useId();

  return (
    <>
      <label htmlFor={id} className={placeholder ? 'sr-only' : undefined}>
        {label}
      </label>
      <div className={`pw-wrap${icon ? ' pw-has-icon' : ''}`}>
        {icon && (
          <span className="pw-mark" aria-hidden="true">
            <Icon name={icon} size={18} />
          </span>
        )}
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          // A password is case-sensitive and a phone keyboard is not, so both
          // are turned off here. On the username box next door they are turned
          // off for the opposite reason: there, case does not matter, and a
          // capital the girl did not ask for used to mean she could not sign
          // in at all.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required={required}
          minLength={minLength}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-describedby={hint ? hintId : undefined}
          data-testid={testId}
        />
        <button
          type="button"
          className="pw-eye"
          onClick={() => setShown((was) => !was)}
          // Says what pressing it will do, which is what a person needs to
          // hear. `aria-pressed` carries the current state for anyone who
          // wants it, so the label does not have to do both jobs.
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          aria-controls={id}
          // Deliberately left in the tab order. A common pattern removes it,
          // on the grounds that someone filling in a form is going somewhere
          // -- but that reasoning assumes the person can see what they typed,
          // and this button exists for the person who cannot.
          data-testid={testId ? `${testId}-toggle` : undefined}
        >
          <Icon name={shown ? 'eye-off' : 'eye'} size={20} />
        </button>
      </div>
      {hint && (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      )}
    </>
  );
}
