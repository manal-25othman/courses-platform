/**
 * Pronunciation, spoken by the browser.
 *
 * The client approved the browser's own voice rather than recorded audio or a
 * paid speech service (SRS 7, `audio.provider` = "browser"). Nothing is
 * downloaded and nothing is stored: the browser says the word.
 *
 * Two things make this less simple than it looks, and both were found by
 * running it rather than by reading the specification:
 *
 *   Having the speech API is not the same as being able to speak. A browser
 *   with no voice installed — common on Linux, and true of a plain headless
 *   Chromium — reports the API, accepts the request and then fails. Checking
 *   only for the API told a student to try again forever at a word that could
 *   never play, and because a word is not learned until it has been heard
 *   (SRS 22), that made the unit impossible to finish with no explanation.
 *
 *   The list of voices is usually empty on the first ask and arrives a moment
 *   later, so the check has to wait for it rather than believe the first
 *   answer.
 */

export interface SpeechResult {
  spoke: boolean;
  reason?: 'unsupported' | 'no-voice' | 'failed';
}

/** Whether the API is present at all. */
function hasApi(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Whether this browser can actually say something.
 *
 * Resolves once the voice list has arrived, or after a short wait if it never
 * does. Callers use this to explain the situation rather than leaving a
 * student pressing a button that cannot work.
 */
export function canSpeak(): Promise<boolean> {
  if (!hasApi()) return Promise.resolve(false);

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const onChanged = () => finish(window.speechSynthesis.getVoices().length > 0);

    window.speechSynthesis.addEventListener?.('voiceschanged', onChanged, { once: true });

    // Some browsers populate the list without ever firing the event.
    setTimeout(() => finish(window.speechSynthesis.getVoices().length > 0), 600);
  });
}

/**
 * Says an English word or sentence.
 *
 * Resolves when speaking has finished, and never rejects: failing to
 * pronounce a word must not break the page around it. `spoke` is false unless
 * the word really was said, because a word she has not heard has not been
 * heard, whatever the browser is doing.
 */
export function speak(text: string, lang = 'en-GB'): Promise<SpeechResult> {
  if (!hasApi()) return Promise.resolve({ spoke: false, reason: 'unsupported' });

  return new Promise<SpeechResult>((resolve) => {
    void (async () => {
      if (!(await canSpeak())) {
        resolve({ spoke: false, reason: 'no-voice' });
        return;
      }

      try {
        // Cancel anything still being said, so tapping several words quickly
        // says the last one rather than queueing them all up.
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.9; // A little slower than default: this is for learners.

        let settled = false;
        const finish = (result: SpeechResult) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };

        utterance.onend = () => finish({ spoke: true });
        utterance.onerror = () => finish({ spoke: false, reason: 'failed' });

        window.speechSynthesis.speak(utterance);

        // A short word can finish without `onend` arriving on some browsers.
        // This only counts as spoken if speaking actually started, so silence
        // is never recorded as having been heard.
        setTimeout(() => {
          if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            finish({ spoke: true });
          }
        }, 1500);

        // And a hard stop, so the button never stays disabled forever.
        setTimeout(() => finish({ spoke: false, reason: 'failed' }), 6000);
      } catch {
        resolve({ spoke: false, reason: 'failed' });
      }
    })();
  });
}
