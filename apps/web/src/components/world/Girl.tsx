import type { CSSProperties } from 'react';

/**
 * The cast.
 *
 * Four girls, drawn here and nowhere else. They are original: flat cut-paper
 * shapes in the same language as the scenes they stand in, built from parts
 * rather than from a picture file, so the whole cast costs a few kilobytes of
 * markup and recolours with the unit it is standing in.
 *
 * They are eleven, not eighteen: round faces, simple clothes, no makeup, no
 * jewellery, no heels. Skin, hair and dress differ between them so a class of
 * girls can find somebody who looks a little like her, and one wears a hijab
 * because some of them do.
 *
 * A character never carries meaning on her own. She reacts beside the work —
 * waving at the top of Home, thinking at a locked gate, cheering at the end of
 * a round — and every screen still reads with her removed.
 */
export type GirlName = 'lina' | 'maya' | 'nour' | 'sara';

/** What she is doing. The pose decides arms, legs and where she leans. */
export type GirlPose =
  | 'wave'      // hello
  | 'read'      // sitting with a book
  | 'walk'      // moving along a path
  | 'think'     // hand to chin, puzzling something out
  | 'cheer'     // both arms up
  | 'listen'    // headphones on
  | 'point';    // showing you something

/** How she feels about it. Only the face changes. */
export type GirlMood = 'happy' | 'bright' | 'thinking' | 'proud';

interface Look {
  skin: string;
  skinShade: string;
  hair: string;
  hairLight: string;
  top: string;
  bottom: string;
  /** Hair shape. 'wrap' is a hijab, drawn as cloth rather than hair. */
  style: 'long' | 'puffs' | 'wrap' | 'bob';
}

const CAST: Record<GirlName, Look> = {
  // Long dark hair, lavender top — the one who greets on Home.
  lina: { skin: '#F0C8A4', skinShade: '#E0AE84', hair: '#3A2A21', hairLight: '#51392C', top: '#8B6FE8', bottom: '#5C4BC4', style: 'long' },
  // Two puffs, coral top — the explorer.
  maya: { skin: '#8D5B34', skinShade: '#754826', hair: '#221913', hairLight: '#33241A', top: '#FF8F70', bottom: '#E0603F', style: 'puffs' },
  // Hijab in mint, sky-blue top — the thinker.
  nour: { skin: '#E2AE80', skinShade: '#CE9765', hair: '#4CC8AE', hairLight: '#6BDCC4', top: '#61B4EE', bottom: '#3D8FCC', style: 'wrap' },
  // Short auburn bob, yellow top — the cheerer.
  sara: { skin: '#FADCBE', skinShade: '#EEC49E', hair: '#B4613A', hairLight: '#CE7A4E', top: '#FFCB5B', bottom: '#E8A72E', style: 'bob' },
};

const INK = '#2A2140';

/** Hair behind the head. Drawn first, so the face sits on top of it. */
function HairBack({ look }: { look: Look }) {
  switch (look.style) {
    case 'long':
      return <path d="M22 44c0-21 17-34 38-34s38 13 38 34c0 26 6 40 6 52 0 6-9 9-22 9H38c-13 0-22-3-22-9 0-12 6-26 6-52Z" fill={look.hair} />;
    case 'puffs':
      return (
        <>
          <circle cx="23" cy="34" r="15" fill={look.hair} />
          <circle cx="97" cy="34" r="15" fill={look.hair} />
          <path d="M26 46c0-19 15-32 34-32s34 13 34 32c0 14 2 20 2 25 0 5-7 7-17 7H41c-10 0-17-2-17-7 0-5 2-11 2-25Z" fill={look.hair} />
        </>
      );
    case 'wrap':
      // Cloth, not hair. It has to read as one piece of fabric pinned under
      // the chin and falling over the shoulders — a shape that follows the
      // hairline instead reads as dyed hair, which is not what this is.
      return (
        <path
          d="M18 54c0-24 19-42 42-42s42 18 42 42c0 12-2 20-6 26-3 5-8 8-14 9 4 8 6 16 6 24 0 6-12 9-28 9s-28-3-28-9c0-12 4-22 11-29-9-2-16-7-20-15-3-5-5-9-5-15Z"
          fill={look.hair}
        />
      );
    default:
      return <path d="M24 46c0-20 16-33 36-33s36 13 36 33c0 16 3 24 3 30 0 5-8 7-19 7H40c-11 0-19-2-19-7 0-6 3-14 3-30Z" fill={look.hair} />;
  }
}

/** Hair in front: the fringe, and whatever frames the face. */
function HairFront({ look }: { look: Look }) {
  if (look.style === 'wrap') {
    return (
      <>
        {/* The soft edge where the cloth meets her face, and the fold that
            crosses under the chin — the two lines that say "fabric". */}
        <path d="M26 50c3-19 17-31 34-31s31 12 34 31c-9-11-20-16-34-16s-25 5-34 16Z" fill={look.hairLight} />
        <path d="M36 84c8 6 16 9 24 9s16-3 24-9c-2 7-10 12-24 12s-22-5-24-12Z" fill={look.hairLight} />
      </>
    );
  }
  return (
    <>
      <path d="M28 46c3-17 16-27 32-27s29 10 32 27c-7-11-18-16-32-16s-25 5-32 16Z" fill={look.hairLight} />
      {look.style === 'puffs' && (
        <>
          <circle cx="23" cy="34" r="6" fill={look.hairLight} />
          <circle cx="97" cy="34" r="6" fill={look.hairLight} />
        </>
      )}
    </>
  );
}

/** The face. Only this changes with her mood. */
function Face({ look, mood }: { look: Look; mood: GirlMood }) {
  const closed = mood === 'proud' || mood === 'bright';
  return (
    <>
      {/* head */}
      <ellipse cx="60" cy="52" rx="31" ry="32" fill={look.skin} />
      {/* ear on the open side */}
      <ellipse cx="91" cy="55" rx="5" ry="7" fill={look.skinShade} />
      {/* cheeks */}
      <ellipse cx="42" cy="62" rx="7" ry="5" fill="#FF9BA8" opacity=".45" />
      <ellipse cx="78" cy="62" rx="7" ry="5" fill="#FF9BA8" opacity=".45" />
      {/* brows: the only thing that says "thinking" */}
      {mood === 'thinking' ? (
        <>
          <path d="M42 38c4-3 9-3 12 0" stroke={look.hair} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M66 35c4-2 9-1 12 2" stroke={look.hair} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M42 37c4-3 9-3 12 0" stroke={look.hair} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M66 37c4-3 9-3 12 0" stroke={look.hair} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </>
      )}
      {/* eyes */}
      {closed ? (
        <>
          <path d="M41 50c3 4 9 4 12 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M67 50c3 4 9 4 12 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="47" cy="50" rx="4.6" ry="5.4" fill={INK} />
          <ellipse cx="73" cy="50" rx="4.6" ry="5.4" fill={INK} />
          <circle cx="48.8" cy="48" r="1.7" fill="#fff" />
          <circle cx="74.8" cy="48" r="1.7" fill="#fff" />
        </>
      )}
      {/* mouth */}
      {mood === 'thinking' ? (
        <path d="M54 68c3-2 7-2 10 0" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      ) : mood === 'bright' ? (
        <path d="M50 65c4 8 16 8 20 0Z" fill={INK} />
      ) : (
        <path d="M51 65c4 6 14 6 18 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      )}
    </>
  );
}

/** Everything below the neck. The pose decides it. */
function Body({ look, pose }: { look: Look; pose: GirlPose }) {
  const arm = (d: string) => (
    <path d={d} stroke={look.skin} strokeWidth="9" fill="none" strokeLinecap="round" />
  );
  const leg = (d: string) => (
    <path d={d} stroke={look.skin} strokeWidth="9" fill="none" strokeLinecap="round" />
  );
  const shoe = (cx: number, cy: number, rotate = 0) => (
    <ellipse cx={cx} cy={cy} rx="9" ry="5" fill={look.bottom} transform={`rotate(${rotate} ${cx} ${cy})`} />
  );

  if (pose === 'read') {
    // Sitting cross-legged with a book on her knees.
    return (
      <>
        {leg('M46 132h-14')}
        {leg('M74 132h14')}
        <path d="M60 80c-16 0-26 9-28 24-1 9-1 18 0 24h56c1-6 1-15 0-24-2-15-12-24-28-24Z" fill={look.top} />
        {arm('M40 100c-6 8-7 16-4 22')}
        {arm('M80 100c6 8 7 16 4 22')}
        {/* the book */}
        <path d="M34 118h52v18H34z" fill="#FFF6E6" />
        <path d="M58 118h4v18h-4z" fill={look.bottom} />
        <path d="M32 116l28 4 28-4v4l-28 4-28-4z" fill={look.bottom} />
      </>
    );
  }

  if (pose === 'cheer') {
    return (
      <>
        {leg('M52 128v18')}
        {leg('M68 128v18')}
        {shoe(50, 148, -8)}
        {shoe(70, 148, 8)}
        <path d="M60 80c-15 0-24 8-26 22l-2 26h56l-2-26c-2-14-11-22-26-22Z" fill={look.top} />
        {arm('M38 94c-8-8-11-18-10-26')}
        {arm('M82 94c8-8 11-18 10-26')}
      </>
    );
  }

  if (pose === 'walk') {
    return (
      <>
        {leg('M56 126l-8 18')}
        {leg('M66 126l10 16')}
        {shoe(45, 146, -14)}
        {shoe(79, 144, 12)}
        <path d="M60 80c-15 0-24 8-26 22l-2 26h56l-2-26c-2-14-11-22-26-22Z" fill={look.top} />
        {arm('M38 96c-5 8-6 15-4 21')}
        {arm('M82 96c6-6 9-13 9-20')}
      </>
    );
  }

  if (pose === 'think') {
    return (
      <>
        {leg('M52 128v18')}
        {leg('M68 128v18')}
        {shoe(50, 148, -8)}
        {shoe(70, 148, 8)}
        <path d="M60 80c-15 0-24 8-26 22l-2 26h56l-2-26c-2-14-11-22-26-22Z" fill={look.top} />
        {arm('M38 96c-4 9-3 17 2 22')}
        {/* hand to the chin */}
        {arm('M82 96c2-10-4-18-12-20')}
      </>
    );
  }

  if (pose === 'point') {
    return (
      <>
        {leg('M52 128v18')}
        {leg('M68 128v18')}
        {shoe(50, 148, -8)}
        {shoe(70, 148, 8)}
        <path d="M60 80c-15 0-24 8-26 22l-2 26h56l-2-26c-2-14-11-22-26-22Z" fill={look.top} />
        {arm('M38 96c-4 9-3 17 2 22')}
        {arm('M82 92c9-1 17-3 25-7')}
        <circle cx="110" cy="84" r="5" fill={look.skin} />
      </>
    );
  }

  // wave and listen share a stance; listen adds headphones over the head.
  return (
    <>
      {leg('M52 128v18')}
      {leg('M68 128v18')}
      {shoe(50, 148, -8)}
      {shoe(70, 148, 8)}
      <path d="M60 80c-15 0-24 8-26 22l-2 26h56l-2-26c-2-14-11-22-26-22Z" fill={look.top} />
      {arm('M38 96c-4 9-3 17 2 22')}
      {pose === 'wave' ? arm('M82 94c7-5 11-12 12-20') : arm('M82 96c4 9 3 17-2 22')}
    </>
  );
}

export function Girl({
  who = 'lina',
  pose = 'wave',
  mood = 'happy',
  className = 'girl',
  style,
  title,
}: {
  who?: GirlName;
  pose?: GirlPose;
  mood?: GirlMood;
  className?: string;
  style?: CSSProperties;
  /** Given only where she carries meaning a screen reader would otherwise miss. */
  title?: string;
}) {
  const look = CAST[who];

  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 120 160"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <HairBack look={look} />
      <Body look={look} pose={pose} />
      <Face look={look} mood={mood} />
      <HairFront look={look} />
      {pose === 'listen' && (
        <>
          <path d="M26 52a34 34 0 0 1 68 0" stroke="#5C4BC4" strokeWidth="6" fill="none" strokeLinecap="round" />
          <rect x="18" y="46" width="15" height="22" rx="7" fill="#5C4BC4" />
          <rect x="87" y="46" width="15" height="22" rx="7" fill="#5C4BC4" />
        </>
      )}
      {pose === 'think' && (
        <>
          <circle cx="99" cy="30" r="5" fill="#fff" opacity=".95" />
          <circle cx="108" cy="18" r="7" fill="#fff" opacity=".95" />
          <text x="108" y="23" textAnchor="middle" fontSize="11" fontWeight="800" fill="#8B6FE8">?</text>
        </>
      )}
    </svg>
  );
}
