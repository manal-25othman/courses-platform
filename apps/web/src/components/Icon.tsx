/**
 * The icon set.
 *
 * Drawn here rather than pulled from a library: eleven glyphs is far less than
 * a dependency's weight, and it keeps one stroke width and one corner
 * treatment across the product. Emoji are deliberately not used as interface
 * icons — they render differently on every device and carry a tone this
 * product does not want.
 */
export type IconName =
  | 'words' | 'grammar' | 'activity' | 'assessment' | 'games'
  | 'home' | 'progress' | 'message' | 'teacher'
  | 'lock' | 'tick' | 'cross' | 'play' | 'sound' | 'back' | 'star' | 'signout';

const paths: Record<IconName, React.ReactNode> = {
  // Words: a card with a line of text on it.
  words: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 10h6M7 14h4" /></>,
  // Grammar: a book, opened.
  grammar: <><path d="M12 6v13" /><path d="M12 6C10 4.6 7.5 4.5 4 5.4V18c3.5-.9 6-.8 8 .6 2-1.4 4.5-1.5 8-.6V5.4c-3.5-.9-6-.8-8 .6Z" /></>,
  // Activity: a controller-ish shape — this is the playful quarter.
  activity: <><rect x="2.5" y="7" width="19" height="11" rx="5" /><path d="M7 11v3M5.5 12.5h3M15.5 12h.01M18 14h.01" /></>,
  // Assessment: a marked sheet.
  assessment: <><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8.5 12.5l2.2 2.2 4.6-4.6" /></>,
  // Games: a die.
  games: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" /></>,
  home: <><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /></>,
  progress: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
  message: <><path d="M20.5 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-5.4A7.5 7.5 0 1 1 20.5 12.5Z" /></>,
  teacher: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  tick: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  cross: <path d="M6 6l12 12M18 6 6 18" />,
  play: <path d="M8 5.5v13l10-6.5z" />,
  sound: <><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4Z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>,
  back: <path d="M15 5.5 8 12l7 6.5" />,
  star: <path d="m12 3.8 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 10l5.9-.9z" />,
  signout: <><path d="M14.5 8V5.5h-9v13h9V16" /><path d="M11 12h9.5M17.5 8.5 21 12l-3.5 3.5" /></>,
};

export function Icon({
  name,
  className = 'ico',
  size,
}: {
  name: IconName;
  className?: string;
  /** Overrides the class size, for the few places a glyph sits inside text. */
  size?: number;
}) {
  return (
    <svg
      className={className}
      style={size ? { width: size, height: size } : undefined}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
