/**
 * The one place the teacher's name is written into the product.
 *
 * It is here for the sign-in page alone. That page is public and has no
 * session, so it cannot ask the API who anybody's teacher is; the line it
 * carries is a piece of branding rather than a fact about a student, and a
 * constant is the honest shape for it.
 *
 * Everywhere behind a sign-in, the teacher's name comes from her own profile
 * through `/teachers/mine` — the teacher this student is actually assigned to
 * — so a school with more than one teacher never shows a girl the wrong name.
 * Do not use this constant there.
 *
 * The interface is English-only, so the English form is what ships. The Arabic
 * form, الأستاذة نجوى الشهراني, is recorded here in a comment for the handover
 * documents and is deliberately not rendered.
 *
 * This is a name and a subject. It makes no claim about who owns the platform,
 * who administers the school, or who built the software.
 */
export const TEACHER_ATTRIBUTION = 'English Learning with Ms. Najwa Al-Shahrani';
