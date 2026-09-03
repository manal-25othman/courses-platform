/**
 * Saying a vocabulary word out loud.
 *
 * One boundary, two sources behind it. Everything the screens know is
 * `pronounce()` and `stopPronouncing()`; nothing outside this file touches
 * `speechSynthesis` or an `Audio` element, so adding a hosted voice later is a
 * new source in this file rather than a change to the vocabulary screen.
 *
 * The order is the client's: a teacher's own recording when one exists,
 * otherwise the browser's voice. Both are free. No key, no account, no
 * network call to a third party.
 *
 * One rule runs through all of it, and it is the reason this file is careful
 * rather than short: **a word is only heard if a sound actually started**.
 * Vocabulary completion depends on it (SRS 22), and completion gates the unit
 * test, so a generous guess here inflates a student's progress. `onStart` is
 * therefore called from a real event — `onstart` for speech, `playing` for a
 * recording — and never from a timer, a queue length or an optimistic
 * assumption.
 */

/** Which source actually made the sound. Matches the API's AudioSource. */
export type SpokenBy = 'teacher_audio' | 'browser_tts';

export type PronounceResult =
  | { spoke: true; by: SpokenBy }
  | {
      spoke: false;
      /**
       * `no-source`   — no recording and no usable voice on this device.
       * `no-english`  — the device speaks, but has no English voice.
       * `failed`      — a source was available and did not work.
       * `superseded`  — she moved to another word before this one started.
       */
      reason: 'no-source' | 'no-english' | 'failed' | 'superseded';
    };

export interface PronounceRequest {
  /** The English word, exactly as the curriculum has it. */
  text: string;
  /** The teacher's recording, when the API sent one. */
  recordingUrl?: string | null;
  /**
   * Called once, at the moment sound genuinely begins, with the source that
   * produced it. This — and only this — is when a word may be marked heard.
   */
  onStart?: (by: SpokenBy) => void;
}

/* ------------------------------------------------------------------ engine */

function engine(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

/**
 * The device's voices, waited for.
 *
 * The list is empty on the first ask in most browsers and arrives a moment
 * later; on some it arrives without ever firing the event. So this asks,
 * listens, and also re-checks on a short interval, giving up after a budget
 * that is long enough for a slow phone but short enough not to feel broken.
 */
function voices(budgetMs = 2500): Promise<SpeechSynthesisVoice[]> {
  const tts = engine();
  if (!tts) return Promise.resolve([]);

  const now = tts.getVoices();
  if (now.length > 0) return Promise.resolve(now);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(stop);
      tts.removeEventListener?.('voiceschanged', onChanged);
      resolve(tts.getVoices());
    };
    const onChanged = () => {
      if (tts.getVoices().length > 0) finish();
    };
    tts.addEventListener?.('voiceschanged', onChanged);
    const poll = setInterval(() => {
      if (tts.getVoices().length > 0) finish();
    }, 250);
    const stop = setTimeout(finish, budgetMs);
  });
}

/**
 * The best English voice this device actually has.
 *
 * Never a hard-coded name — voice inventories differ per platform, per OS
 * version and per installed language pack, so naming one is a bug waiting for
 * a device we do not own. The preference order is:
 *
 *   1. the exact locale asked for (en-GB), so British spelling gets a
 *      British reading;
 *   2. any other English voice;
 *   3. among those, one that runs on the device rather than over the
 *      network, because it keeps working on a school connection.
 *
 * Returns null when the device has no English voice at all. That is treated
 * as "cannot pronounce" rather than falling back to whatever voice is
 * default: these students' devices are commonly set to Arabic, and reading an
 * English word with an Arabic voice teaches the wrong pronunciation, which is
 * worse for this product than saying nothing. It is a deliberate choice and
 * the client can reverse it.
 */
export function pickEnglishVoice(
  all: SpeechSynthesisVoice[],
  preferred = 'en-GB',
): SpeechSynthesisVoice | null {
  const english = all.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  if (english.length === 0) return null;

  const want = preferred.toLowerCase();
  const score = (v: SpeechSynthesisVoice) => {
    let n = 0;
    if (v.lang.toLowerCase() === want) n += 4;
    if (v.localService) n += 2;
    if (v.default) n += 1;
    return n;
  };
  return [...english].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/* ------------------------------------------------- one attempt at a time */

/**
 * Which request is current.
 *
 * Every call takes the next number. A call whose number is stale has been
 * superseded — she has tapped another word — and must neither report itself
 * as spoken nor fire `onStart`. This is exactly the case that used to mark a
 * skipped word as heard: cancelling a queued utterance fires its `end` event,
 * which is indistinguishable from finishing unless the caller tracks this.
 */
let token = 0;
let playing: HTMLAudioElement | null = null;

/** Stops anything being said. Safe to call when nothing is. */
export function stopPronouncing(): void {
  token += 1;
  try {
    engine()?.cancel();
  } catch {
    /* a browser that refuses to cancel is not worth crashing over */
  }
  if (playing) {
    try {
      playing.pause();
      playing.src = '';
    } catch {
      /* same */
    }
    playing = null;
  }
}

/* ----------------------------------------------------------------- sources */

/** Plays a file the teacher recorded. Resolves only on a real outcome. */
function playRecording(
  url: string,
  mine: number,
  onStart?: (by: SpokenBy) => void,
): Promise<PronounceResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: PronounceResult) => {
      if (settled) return;
      settled = true;
      if (playing === audio) playing = null;
      resolve(r);
    };

    let audio: HTMLAudioElement;
    try {
      audio = new Audio(url);
    } catch {
      resolve({ spoke: false, reason: 'failed' });
      return;
    }
    playing = audio;

    // `playing` fires when sound is actually coming out, which is the honest
    // moment to count the word as heard — not when play() was called.
    audio.addEventListener(
      'playing',
      () => {
        if (mine !== token) return finish({ spoke: false, reason: 'superseded' });
        onStart?.('teacher_audio');
      },
      { once: true },
    );
    audio.addEventListener('ended', () => finish({ spoke: true, by: 'teacher_audio' }), {
      once: true,
    });
    audio.addEventListener('error', () => finish({ spoke: false, reason: 'failed' }), {
      once: true,
    });

    void audio.play().catch(() => finish({ spoke: false, reason: 'failed' }));

    // A safety net so the control cannot stay disabled forever. It reports
    // success only if the file really got part-way through.
    setTimeout(() => {
      if (mine !== token) return finish({ spoke: false, reason: 'superseded' });
      finish(
        audio.currentTime > 0
          ? { spoke: true, by: 'teacher_audio' }
          : { spoke: false, reason: 'failed' },
      );
    }, 15000);
  });
}

/** Says the word with the browser's own voice. */
async function speakIt(
  text: string,
  mine: number,
  onStart?: (by: SpokenBy) => void,
): Promise<PronounceResult> {
  const tts = engine();
  if (!tts) return { spoke: false, reason: 'no-source' };

  const available = await voices();
  if (mine !== token) return { spoke: false, reason: 'superseded' };
  if (available.length === 0) return { spoke: false, reason: 'no-source' };

  const voice = pickEnglishVoice(available);
  if (!voice) return { spoke: false, reason: 'no-english' };

  return new Promise<PronounceResult>((resolve) => {
    let settled = false;
    let started = false;
    const finish = (r: PronounceResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(giveUp);
      resolve(r);
    };

    let utterance: SpeechSynthesisUtterance;
    try {
      utterance = new SpeechSynthesisUtterance(text);
    } catch {
      resolve({ spoke: false, reason: 'failed' });
      return;
    }

    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.9; // A little slower than default: this is for learners.

    utterance.onstart = () => {
      if (mine !== token) return;
      started = true;
      onStart?.('browser_tts');
    };
    // `end` also arrives for an utterance removed by cancel(), so finishing
    // is only real if `start` was seen first. Without this, moving to the
    // next word marked the one she skipped as heard.
    utterance.onend = () =>
      finish(
        started && mine === token
          ? { spoke: true, by: 'browser_tts' }
          : { spoke: false, reason: 'superseded' },
      );
    utterance.onerror = () =>
      finish({ spoke: false, reason: started ? 'failed' : mine === token ? 'failed' : 'superseded' });

    const giveUp = setTimeout(
      () => finish(started ? { spoke: true, by: 'browser_tts' } : { spoke: false, reason: 'failed' }),
      15000,
    );

    try {
      tts.speak(utterance);
    } catch {
      finish({ spoke: false, reason: 'failed' });
    }
  });
}

/* ------------------------------------------------------------------ public */

/**
 * Says a word, using the best source this device has.
 *
 * The teacher's recording comes first when there is one. If it fails — a
 * missing file, a network that dropped — the browser's voice is tried rather
 * than leaving her stuck: hearing the word in a slightly different voice is
 * better than not hearing it, and the source that actually made the sound is
 * what gets reported, so nothing is recorded untruthfully.
 */
export async function pronounce(req: PronounceRequest): Promise<PronounceResult> {
  token += 1;
  const mine = token;

  // Whatever is being said now is no longer wanted.
  try {
    engine()?.cancel();
  } catch {
    /* ignore */
  }
  if (playing) {
    try {
      playing.pause();
    } catch {
      /* ignore */
    }
    playing = null;
  }

  if (req.recordingUrl) {
    const played = await playRecording(req.recordingUrl, mine, req.onStart);
    if (played.spoke || played.reason === 'superseded') return played;
    // The recording did not work. Fall through to the browser's voice.
  }

  if (mine !== token) return { spoke: false, reason: 'superseded' };
  return speakIt(req.text, mine, req.onStart);
}

/**
 * Whether this device can pronounce English at all, ignoring recordings.
 *
 * Used to explain the situation up front rather than leaving a student
 * pressing a button that cannot work. `no-english` is reported separately
 * from `no-voice` because the two need different advice.
 */
export async function englishSpeechStatus(): Promise<'ok' | 'no-voice' | 'unsupported'> {
  if (!engine()) return 'unsupported';
  const available = await voices();
  if (available.length === 0) return 'unsupported';
  return pickEnglishVoice(available) ? 'ok' : 'no-voice';
}
