import { describe, expect, it } from 'vitest';
import { attemptSubject } from './auth-throttle.guard';

/** A request as Express hands it to a guard: body parsed, nothing validated. */
function request(body: unknown, extra: Record<string, unknown> = {}) {
  return { body, ip: '10.0.0.1', ...extra } as Record<string, unknown>;
}

describe('attemptSubject', () => {
  it('counts sign-in attempts against the account, not the address', () => {
    const first = attemptSubject(request({ username: 'sara', password: 'a' }));
    const second = attemptSubject(
      request({ username: 'sara', password: 'b' }, { ip: '198.51.100.4' }),
    );

    expect(first).toBe(second);
  });

  it('gives each girl her own allowance, so a class cannot lock itself out', () => {
    // Both arrive from one address, which is what the website's proxy makes
    // every one of them look like.
    const sara = attemptSubject(request({ username: 'sara' }));
    const hind = attemptSubject(request({ username: 'hind' }));

    expect(sara).not.toBe(hind);
  });

  it('treats one account spelled two ways as one account', () => {
    expect(attemptSubject(request({ username: '  SARA ' }))).toBe(
      attemptSubject(request({ username: 'sara' })),
    );
  });

  it('ignores the school, which is optional and could otherwise double it', () => {
    expect(attemptSubject(request({ username: 'sara', schoolId: 'a-school' }))).toBe(
      attemptSubject(request({ username: 'sara' })),
    );
  });

  it('uses the email when that is who the attempt names', () => {
    const subject = attemptSubject(request({ email: 'Teacher@example.com' }));
    expect(subject).toBe('account:teacher@example.com');
  });

  it('falls back to the address when nothing names an account', () => {
    // Guessing a reset token is the case: there is no account in the request,
    // so the caller is the only subject there is.
    expect(attemptSubject(request({ token: 'guess' }))).toBe('address:10.0.0.1');
  });

  it('uses the signed-in account where there is one', () => {
    expect(attemptSubject(request({}, { user: { id: 'user-1' } }))).toBe('user:user-1');
  });

  it('is not fooled by a username that is not text', () => {
    expect(attemptSubject(request({ username: { toString: () => 'sara' } }))).toBe(
      'address:10.0.0.1',
    );
  });

  it('survives a request with no body at all', () => {
    expect(attemptSubject({ ip: '10.0.0.1' })).toBe('address:10.0.0.1');
  });
});
