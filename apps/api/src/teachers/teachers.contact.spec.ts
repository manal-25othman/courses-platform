/**
 * A teacher's phone number stays behind a sign-in.
 *
 * The client decided this on 2026-09-20, against a real alternative: a student
 * locked out of her account is told to ask her teacher, and has no way to do
 * it, because the WhatsApp button lives on a page she cannot reach. Putting
 * the number on the sign-in screen would fix that — and would publish a
 * teacher's personal mobile number to anyone who loads the page, including
 * anyone who can guess the school's address.
 *
 * The decision was: keep it protected. A student who cannot sign in contacts
 * the school through its existing channel, and no support number is invented
 * to fill the gap.
 *
 * That decision is invisible in the code — it looks like an absence, and an
 * absence is exactly what a later well-meaning change removes. So these tests
 * state it as a rule: the number is reachable only by an authenticated student
 * asking for her own teacher, it is never returned when unset, and it is never
 * the raw number.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { whatsappDigits } from './teachers.service';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');

describe('the number is not on any page a stranger can open', () => {
  /**
   * Read as text on purpose. The question is not what a component renders
   * given some state — it is whether these three files mention a phone number
   * at all. A grep is the honest shape of "this must not appear here".
   */
  const PUBLIC_PAGES = [
    '../../../../apps/web/src/app/login/page.tsx',
    '../../../../apps/web/src/app/forgot-password/page.tsx',
    '../../../../apps/web/src/app/reset-password/page.tsx',
  ];

  it.each(PUBLIC_PAGES)('%s carries no WhatsApp link or number', (page) => {
    const source = read(page).toLowerCase();

    expect(source).not.toContain('wa.me');
    expect(source).not.toContain('whatsapp');
    // A number typed straight in, in any of the shapes a person writes one.
    expect(source).not.toMatch(/\+?\d[\d\s().-]{8,}\d/);
  });

  it('keeps the sign-in screen pointing at a person, not a number', () => {
    // The wording the client approved: she is told who can help her, and is
    // not handed a way to contact them that bypasses the school.
    const login = read('../../../../apps/web/src/app/login/page.tsx');
    expect(login).toMatch(/ask your teacher/i);
  });
});

describe('who may read a teacher’s number', () => {
  const controller = read('./teachers.controller.ts');

  it('offers it to a signed-in student, for her own teacher only', () => {
    // The route exists, and it is guarded to STUDENT. If that guard is ever
    // dropped, this is the test that notices.
    expect(controller).toMatch(
      /@Roles\(UserRole\.STUDENT\)\s*@Get\('mine'\)/,
    );
  });

  it('has no route that answers without a role at all', () => {
    // Every @Get in this controller must sit under a @Roles line. A public
    // route here would be the exact thing the decision ruled out.
    const gets = controller.match(/@Get\(/g) ?? [];
    const guarded = controller.match(/@Roles\([^)]*\)\s*@Get\(/g) ?? [];
    expect(gets.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(gets.length);
  });
});

describe('what is handed out is a link, never the number', () => {
  it('is silent when no number is set', () => {
    // The fallback the client asked for: nothing configured means nothing
    // shown, rather than a broken link or an empty button.
    expect(whatsappDigits(null)).toBeNull();
    expect(whatsappDigits('')).toBeNull();
    expect(whatsappDigits('   ')).toBeNull();
  });

  it('refuses a half-typed number rather than building a link to nowhere', () => {
    expect(whatsappDigits('+966 5')).toBeNull();
    expect(whatsappDigits('123')).toBeNull();
  });

  it('reduces a real number to the digits wa.me needs', () => {
    // Written the way a person writes it, in several shapes.
    expect(whatsappDigits('+966 50 000 0000')).toBe('966500000000');
    expect(whatsappDigits('(966) 50-000-0000')).toBe('966500000000');
    expect(whatsappDigits('966500000000')).toBe('966500000000');
  });
});
