/**
 * What counts as the same username.
 *
 * A name is stored the way it was typed and shown back that way -- "Sara.Q"
 * stays "Sara.Q" on her own account page -- but two names that differ only in
 * capitals are the same name. An eleven-year-old typing on a tablet gets a
 * capital first letter whether she wants one or not, and being told her
 * password is wrong because of it is indistinguishable, to her, from having
 * forgotten it.
 *
 * So case is a matter of presentation, never of identity. This module is the
 * single statement of that: the comparison below is what signing in uses, what
 * creating an account uses, and what the database index enforces. Three places
 * with the same rule written out three times is how the rule stops being one
 * rule.
 *
 * Deliberately narrow. Passwords and e-mail addresses are untouched: a
 * password is a secret whose every character must count, and an address is
 * matched elsewhere by its own rules.
 */

/**
 * The form two usernames are compared in.
 *
 * `toLowerCase` and not `toLocaleLowerCase`: the locale-aware version maps
 * "I" to a dotless "ı" under a Turkish locale, so the same two names would
 * compare equal on one server and not on another. A username is an identifier,
 * and an identifier that depends on where the server is standing is not one.
 *
 * Surrounding spaces go too. A name pasted with a trailing space is the name,
 * and storing it with the space produces an account nobody can sign in to
 * without knowing the space is there.
 */
export function usernameKey(username: string): string {
  return username.trim().toLowerCase();
}

/** Whether two usernames name the same account. */
export function sameUsername(a: string, b: string): boolean {
  return usernameKey(a) === usernameKey(b);
}

/**
 * How a username is stored: as typed, minus the surrounding space.
 *
 * Not lowercased. Lowercasing on the way in would quietly rename every
 * account -- "Sara.Q" becoming "sara.q" on her own screen -- to solve a
 * problem that comparison already solves.
 */
export function storedUsername(username: string): string {
  return username.trim();
}
