-- Data integrity. Every query here should return zero rows; anything it prints
-- is a problem. Safe to run against a live database — it only reads.

\pset pager off
\echo '=== 1. ORPHANS: a row whose parent is gone ==='

\echo '-- users pointing at a school that does not exist'
SELECT u.id, u.username FROM users u
WHERE u.school_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM schools s WHERE s.id = u.school_id);

\echo '-- progress belonging to no user'
SELECT 'vocabulary_progress' AS t, p.id FROM vocabulary_progress p
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.student_id)
UNION ALL
SELECT 'section_progress', p.id FROM section_progress p
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.student_id)
UNION ALL
SELECT 'activity_attempts', a.id FROM activity_attempts a
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.student_id);

\echo '-- answers with no attempt'
SELECT a.id FROM attempt_answers a
WHERE NOT EXISTS (SELECT 1 FROM activity_attempts t WHERE t.id = a.attempt_id);

\echo '-- messages whose school, teacher, student or sender is missing'
SELECT m.id FROM messages m
WHERE NOT EXISTS (SELECT 1 FROM schools s WHERE s.id = m.school_id)
   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.teacher_id)
   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.student_id)
   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.sender_id);

\echo '-- curriculum rows whose unit or course is gone'
SELECT 'units' AS t, x.id FROM units x WHERE NOT EXISTS (SELECT 1 FROM courses c WHERE c.id = x.course_id)
UNION ALL SELECT 'unit_sections', x.id FROM unit_sections x WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.id = x.unit_id)
UNION ALL SELECT 'vocabulary_items', x.id FROM vocabulary_items x WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.id = x.unit_id)
UNION ALL SELECT 'questions', x.id FROM questions x WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.id = x.unit_id)
UNION ALL SELECT 'media_assets', x.id FROM media_assets x WHERE x.section_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM unit_sections s WHERE s.id = x.section_id);

\echo '-- settings pointing at a school that is gone'
SELECT id, key FROM settings
WHERE scope = 'SCHOOL' AND scope_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM schools s WHERE s.id = scope_id);

\echo ''
\echo '=== 2. DUPLICATES where uniqueness is required ==='

\echo '-- the same word twice in one unit'
SELECT unit_id, word_en, count(*) FROM vocabulary_items GROUP BY 1,2 HAVING count(*) > 1;

\echo '-- the same username twice in one school'
SELECT school_id, username, count(*) FROM users GROUP BY 1,2 HAVING count(*) > 1;

\echo '-- two progress rows for the same student and word'
SELECT student_id, item_id, count(*) FROM vocabulary_progress GROUP BY 1,2 HAVING count(*) > 1;

\echo '-- two progress rows for the same student and section'
SELECT student_id, section_id, count(*) FROM section_progress GROUP BY 1,2 HAVING count(*) > 1;

\echo '-- duplicate GLOBAL settings (the unique index does not cover NULL scope_id)'
SELECT key, count(*) FROM settings WHERE scope = 'GLOBAL' GROUP BY 1 HAVING count(*) > 1;

\echo ''
\echo '=== 3. CONSISTENCY of a student"s recorded work ==='

\echo '-- a word marked learned without meeting the recorded steps'
SELECT id, student_id, item_id FROM vocabulary_progress
WHERE learned_at IS NOT NULL AND (seen_at IS NULL OR audio_played_at IS NULL);

\echo '-- a word verified but not marked learned'
SELECT id FROM vocabulary_progress WHERE verified_at IS NOT NULL AND learned_at IS NULL;

\echo '-- a submitted attempt missing its result'
SELECT id FROM activity_attempts
WHERE status = 'SUBMITTED'
  AND (submitted_at IS NULL OR score_percent IS NULL OR points_available IS NULL);

\echo '-- an unfinished attempt that already carries a result'
SELECT id FROM activity_attempts
WHERE status = 'IN_PROGRESS' AND (submitted_at IS NOT NULL OR score_percent IS NOT NULL);

\echo '-- a score that does not follow from its own marks'
SELECT id, points_awarded, points_available, score_percent
FROM activity_attempts
WHERE status = 'SUBMITTED' AND points_available > 0
  AND score_percent <> round((points_awarded::numeric / points_available) * 100);

\echo '-- correct + incorrect not equal to the number of questions answered'
SELECT a.id, a.correct_count, a.incorrect_count, count(x.id) AS answers
FROM activity_attempts a JOIN attempt_answers x ON x.attempt_id = a.id
WHERE a.status = 'SUBMITTED'
GROUP BY a.id, a.correct_count, a.incorrect_count
HAVING a.correct_count + a.incorrect_count <> count(x.id);

\echo '-- an attempt answer with no frozen question in it'
SELECT id FROM attempt_answers
WHERE snapshot IS NULL
   OR snapshot->>'typeKey' IS NULL
   OR snapshot->>'prompt' IS NULL
   OR snapshot->'answerKey' IS NULL;

\echo '-- a message a student sent to a teacher who is not hers'
SELECT m.id FROM messages m
JOIN student_profiles sp ON sp.user_id = m.student_id
WHERE sp.assigned_teacher_id IS NOT NULL AND sp.assigned_teacher_id <> m.teacher_id;

\echo '-- a message whose sender is neither of its two participants'
SELECT id FROM messages WHERE sender_id <> teacher_id AND sender_id <> student_id;

\echo '-- a message whose school does not match its student"s'
SELECT m.id FROM messages m JOIN users u ON u.id = m.student_id
WHERE u.school_id IS DISTINCT FROM m.school_id;

\echo '-- a picture row with neither a file nor a usable address'
SELECT id FROM media_assets WHERE (data IS NULL AND url = '') OR mime_type = '';

\echo '-- published content inside a unit that is still a draft (invisible either way, but inconsistent)'
SELECT 'questions' AS t, q.id FROM questions q JOIN units u ON u.id = q.unit_id
WHERE q.status = 'PUBLISHED' AND u.status <> 'PUBLISHED'
UNION ALL
SELECT 'vocabulary_items', v.id FROM vocabulary_items v JOIN units u ON u.id = v.unit_id
WHERE v.status = 'PUBLISHED' AND u.status <> 'PUBLISHED';

\echo ''
\echo '=== 4. WHAT STUDENTS CAN CURRENTLY SEE ==='
\echo '-- Run this before a pilot goes live. Anything listed here is visible to'
\echo '-- students today, so nothing in it should be test material.'
SELECT u.title AS unit,
       (SELECT count(*) FROM vocabulary_items v WHERE v.unit_id=u.id AND v.status='PUBLISHED') AS words,
       (SELECT count(*) FROM unit_sections s WHERE s.unit_id=u.id AND s.status='PUBLISHED') AS sections,
       (SELECT count(*) FROM questions q WHERE q.unit_id=u.id AND q.status='PUBLISHED') AS questions
FROM units u WHERE u.status='PUBLISHED' ORDER BY u.order_index;

\echo '-- every word a student can see, so it can be eyeballed'
SELECT u.title AS unit, v.word_en, coalesce(v.meaning_ar,'(none)') AS meaning
FROM vocabulary_items v JOIN units u ON u.id=v.unit_id
WHERE v.status='PUBLISHED' AND u.status='PUBLISHED'
ORDER BY u.order_index, v.order_index;

\echo '-- anything still held back from students'
SELECT 'questions needing a teacher check' AS held_back, count(*) FROM questions WHERE needs_review
UNION ALL SELECT 'draft questions', count(*) FROM questions WHERE status='DRAFT'
UNION ALL SELECT 'draft units', count(*) FROM units WHERE status<>'PUBLISHED';
