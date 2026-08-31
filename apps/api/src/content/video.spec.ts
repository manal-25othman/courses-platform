/**
 * The video field is the one place a teacher's text could become markup, so
 * these tests are mostly about what must be refused.
 */
import { describe, expect, it } from 'vitest';
import { readVideoUrl, UnsupportedVideoError } from './video';

const HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'drive.google.com'];
const refuse = (url: string, hosts = HOSTS) => () => readVideoUrl(url, hosts);

describe('readVideoUrl', () => {
  it('builds a YouTube player from a watch link', () => {
    const v = readVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', HOSTS);
    expect(v.embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(v.provider).toBe('youtube');
  });

  it('builds a YouTube player from a short link', () => {
    expect(readVideoUrl('https://youtu.be/dQw4w9WgXcQ', HOSTS).embedUrl).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  it('builds a Drive player from a file link', () => {
    const v = readVideoUrl('https://drive.google.com/file/d/1AbCdEfGhIjK/view?usp=sharing', HOSTS);
    expect(v.embedUrl).toBe('https://drive.google.com/file/d/1AbCdEfGhIjK/preview');
    expect(v.provider).toBe('google-drive');
  });

  it('keeps the address the teacher typed, not the one it built', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42';
    expect(readVideoUrl(url, HOSTS).url).toBe(url);
  });

  // --- what must never get through ----------------------------------------

  it('refuses a javascript: address', () => {
    expect(refuse('javascript:alert(1)')).toThrow(UnsupportedVideoError);
  });

  it('refuses a data: address', () => {
    expect(refuse('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toThrow(
      UnsupportedVideoError,
    );
  });

  it('refuses plain http even on an allowed host', () => {
    expect(refuse('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toThrow(/https/);
  });

  it('refuses a host that is not on the list', () => {
    expect(refuse('https://evil.example.com/watch?v=dQw4w9WgXcQ')).toThrow(/evil\.example\.com/);
  });

  it('refuses a lookalike host that merely ends with an allowed one', () => {
    // The check is equality, not "ends with": notyoutube.com must not pass.
    //
    // The message matters as much as the throw. A host test written with
    // `endsWith` still refuses this address further down, where no provider
    // claims it — so asserting only that it throws would pass against the
    // very bug this guards. Requiring the allow-list's own wording pins the
    // rejection to the allow-list.
    expect(refuse('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toThrow(
      /cannot be played from notyoutube\.com/,
    );
  });

  it('refuses an allowed host used as a subdomain of somewhere else', () => {
    expect(refuse('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ')).toThrow(
      UnsupportedVideoError,
    );
  });

  it('refuses markup pasted into the field', () => {
    expect(refuse('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>')).toThrow(
      UnsupportedVideoError,
    );
  });

  it('refuses an allowed host with no video in the link', () => {
    expect(refuse('https://www.youtube.com/feed/subscriptions')).toThrow(/no video/);
  });

  it('refuses a video id that is the wrong shape', () => {
    expect(refuse('https://youtu.be/../../etc/passwd')).toThrow(UnsupportedVideoError);
  });

  it('embeds nothing at all when the allow-list is empty', () => {
    expect(refuse('https://www.youtube.com/watch?v=dQw4w9WgXcQ', [])).toThrow(UnsupportedVideoError);
  });
});
