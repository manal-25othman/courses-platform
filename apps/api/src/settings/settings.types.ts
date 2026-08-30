import { SettingScope } from '@prisma/client';

/**
 * Where to look for a setting, from most specific to least specific.
 *
 * Resolution walks this list in order and returns the first match, falling back
 * to the GLOBAL value. This is what lets one assessment override the passing
 * score without affecting any other (ARCHITECTURE 1.1, 5.9).
 */
export interface SettingScopeRef {
  scope: SettingScope;
  scopeId: string | null;
}

/** Keys confirmed during architecture review. Typos become compile errors. */
export const SETTING_KEYS = {
  ASSESSMENT_PASSING_SCORE: 'assessment.passing_score',
  ASSESSMENT_MAX_ATTEMPTS: 'assessment.max_attempts',
  ASSESSMENT_RESULT_POLICY: 'assessment.result_policy',
  ACTIVITY_MAX_ATTEMPTS: 'activity.max_attempts',
  PROGRESS_WEIGHTS: 'progress.weights',
  VOCABULARY_COMPLETION_RULE: 'vocabulary.completion_rule',
  AUDIO_PROVIDER: 'audio.provider',
  RANDOMIZATION_SHUFFLE_QUESTIONS: 'randomization.shuffle_questions',
  RANDOMIZATION_SHUFFLE_OPTIONS: 'randomization.shuffle_options',
  RANDOMIZATION_MATCHING_BOTH_COLUMNS: 'randomization.matching_shuffle_both_columns',
  GAMES_AFFECTS_COMPLETION: 'games.affects_completion',
  GAMES_AFFECTS_SCORE: 'games.affects_score',
  GAMES_AFFECTS_PROGRESS: 'games.affects_progress',
  UI_LANGUAGE: 'ui.language',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];
