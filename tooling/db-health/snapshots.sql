-- Do the frozen copies inside finished attempts still say what they said?
--
-- An attempt is marked from the copy taken when the questions were put to the
-- student. This checks that those copies are intact and that they have in fact
-- diverged from the live questions where a teacher has since made a change —
-- divergence is the feature working, not a fault.

\pset pager off
\echo '=== how many frozen answers exist ==='
SELECT count(*) AS answers,
       count(DISTINCT attempt_id) AS attempts,
       count(*) FILTER (WHERE question_id IS NULL) AS question_since_deleted
FROM attempt_answers;

\echo ''
\echo '=== every frozen copy is complete (expect 0 incomplete) ==='
SELECT count(*) FILTER (
  WHERE snapshot->>'questionId' IS NULL OR snapshot->>'typeKey' IS NULL
     OR snapshot->>'prompt' IS NULL OR snapshot->'answerKey' IS NULL
     OR snapshot->>'points' IS NULL OR snapshot->>'capturedAt' IS NULL
) AS incomplete,
count(*) AS total
FROM attempt_answers;

\echo ''
\echo '=== marks agree with the frozen copy they were made from ==='
-- Each answer awarded no more than the marks its own snapshot carried, and a
-- correct answer awarded them all.
SELECT count(*) FILTER (WHERE points_awarded > (snapshot->>'points')::int) AS awarded_more_than_possible,
       count(*) FILTER (WHERE is_correct AND points_awarded < (snapshot->>'points')::int) AS correct_but_underpaid,
       count(*) FILTER (WHERE points_awarded < 0) AS negative
FROM attempt_answers
WHERE points_awarded IS NOT NULL;

\echo ''
\echo '=== where the live question has since been changed ==='
-- Divergence here is expected and desired: it is the evidence that editing a
-- question did not reach back into a result already given.
SELECT count(*) FILTER (WHERE a.snapshot->>'prompt' IS DISTINCT FROM q.prompt) AS wording_differs,
       count(*) FILTER (WHERE a.snapshot->'answerKey' IS DISTINCT FROM q.answer_key) AS answer_key_differs,
       count(*) AS answers_whose_question_still_exists
FROM attempt_answers a JOIN questions q ON q.id = a.question_id;

\echo ''
\echo '=== a submitted attempt total equals the sum of its own answers ==='
SELECT count(*) AS attempts_whose_total_disagrees
FROM (
  SELECT a.id
  FROM activity_attempts a JOIN attempt_answers x ON x.attempt_id = a.id
  WHERE a.status = 'SUBMITTED'
  GROUP BY a.id, a.points_awarded, a.points_available, a.correct_count
  HAVING a.points_awarded <> sum(x.points_awarded)
      OR a.points_available <> sum((x.snapshot->>'points')::int)
      OR a.correct_count <> count(*) FILTER (WHERE x.is_correct)
) bad;
