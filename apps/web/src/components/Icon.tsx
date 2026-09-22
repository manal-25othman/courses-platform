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
  | 'lock' | 'tick' | 'cross' | 'play' | 'sound' | 'back' | 'star' | 'signout'
  | 'eye' | 'eye-off' | 'user' | 'whatsapp' | 'settings';

const paths: Record<IconName, React.ReactNode> = {
  /*
    WhatsApp's own mark, drawn filled against the stroked set on purpose: the
    point of this button is that a child recognises where it goes before she
    reads the label, and a line-art approximation of it does not.
  */
  whatsapp: (
    <path
      fill="currentColor"
      stroke="none"
      d="M17.47 14.38c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.06 2.87 1.21 3.07.15.2 2.09 3.2 5.07 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35ZM12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.38c1.45.79 3.08 1.21 4.75 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm0 18.01c-1.49 0-2.95-.4-4.22-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.83 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.23 8.24Z"
    />
  ),

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
  // A person, for the username box. Same build as `teacher`, named for what
  // it marks here rather than for who it is.
  user: <><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  // Settings: two controls sitting on their rails. A cog is the usual glyph,
  // but at 17px its teeth close into a blur; this stays legible at the size the
  // header draws it, and it says what the page is -- the few things she sets
  // for herself.
  settings: <><path d="M4 8.5h8.5M17.5 8.5H20M4 15.5h2.5M11.5 15.5H20" /><circle cx="15" cy="8.5" r="2.5" /><circle cx="9" cy="15.5" r="2.5" /></>,
  // Eye: shown. The outline everyone already reads as "look at this".
  eye: <><path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  // Eye, struck through: hidden. The stroke is what carries the meaning, so it
  // runs the full width rather than stopping inside the shape.
  'eye-off': <><path d="M2 12s3.8-6 10-6c1.6 0 3 .4 4.3 1M22 12s-3.8 6-10 6c-1.6 0-3-.4-4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="M3.5 3.5l17 17" /></>,
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
