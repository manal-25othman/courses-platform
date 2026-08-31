/**
 * Turns a teacher's video address into something safe to embed.
 *
 * The rule that matters: only an address is ever stored, and the player is
 * built here from its parts. Markup a teacher typed is never rendered, so a
 * `<script>` or an `onerror=` in the field cannot become anything — it simply
 * fails to parse as a video address and is refused when she saves it.
 *
 * Which hosts are allowed is a setting, not a list in code, so the client can
 * add one without a release.
 */

export interface PlayableVideo {
  /** The address the teacher gave, stored as written. */
  url: string;
  /** The address to put in an iframe, built here rather than supplied. */
  embedUrl: string;
  /** Which host it turned out to be, for the label beside the player. */
  provider: 'youtube' | 'google-drive';
}

/** Raised when an address cannot be turned into a player. */
export class UnsupportedVideoError extends Error {}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

/**
 * Reads a video address, or explains why it cannot be used.
 *
 * `allowedHosts` comes from the settings store. An empty list means no video
 * may be embedded at all, which is a valid way to turn the feature off.
 */
export function readVideoUrl(raw: string, allowedHosts: string[]): PlayableVideo {
  const trimmed = raw.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UnsupportedVideoError('That is not a web address. Paste the link to the video.');
  }

  // Anything but https is refused outright. `javascript:` and `data:` are the
  // reason this check is first and absolute rather than part of host matching.
  if (parsed.protocol !== 'https:') {
    throw new UnsupportedVideoError('The link has to start with https://');
  }

  const host = parsed.hostname.toLowerCase();
  if (!allowedHosts.map((h) => h.toLowerCase()).includes(host)) {
    throw new UnsupportedVideoError(
      `Videos cannot be played from ${host}. Allowed: ${allowedHosts.join(', ')}.`,
    );
  }

  // --- YouTube -------------------------------------------------------------
  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1);
    if (!YOUTUBE_ID.test(id)) throw new UnsupportedVideoError('That YouTube link has no video in it.');
    return { url: trimmed, embedUrl: `https://www.youtube.com/embed/${id}`, provider: 'youtube' };
  }

  if (host === 'youtube.com' || host === 'www.youtube.com') {
    const id = parsed.searchParams.get('v') ?? '';
    if (!YOUTUBE_ID.test(id)) throw new UnsupportedVideoError('That YouTube link has no video in it.');
    return { url: trimmed, embedUrl: `https://www.youtube.com/embed/${id}`, provider: 'youtube' };
  }

  // --- Google Drive --------------------------------------------------------
  if (host === 'drive.google.com') {
    const match = parsed.pathname.match(/\/file\/d\/([^/]+)/);
    const id = match?.[1] ?? parsed.searchParams.get('id') ?? '';
    if (!DRIVE_ID.test(id)) throw new UnsupportedVideoError('That Drive link has no file in it.');
    return {
      url: trimmed,
      embedUrl: `https://drive.google.com/file/d/${id}/preview`,
      provider: 'google-drive',
    };
  }

  // A host can be allowed in settings without this knowing how to play it.
  throw new UnsupportedVideoError(`Videos from ${host} cannot be played yet.`);
}
