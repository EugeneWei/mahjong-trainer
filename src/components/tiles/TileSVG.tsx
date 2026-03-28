import { TILE_INFO, Suit, type TileIndex } from '../../engine/tiles';

interface TileSVGProps {
  tile: TileIndex;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  highlighted?: boolean;
  danger?: boolean; // red outline for "discard this"
  dimmed?: boolean;
  onClick?: () => void;
  count?: number;
}

const SUIT_COLORS: Record<number, string> = {
  [Suit.Bamboo]: '#22c55e',     // green
  [Suit.Characters]: '#ef4444', // red
  [Suit.Dots]: '#3b82f6',      // blue
};

// Short English labels so players can learn the suits
const SUIT_LABELS: Record<number, string> = {
  [Suit.Bamboo]: 'Bam',
  [Suit.Characters]: 'Wan',
  [Suit.Dots]: 'Dot',
};

const DRAGON_COLORS: Record<string, string> = {
  Red: '#dc2626',
  Green: '#16a34a',
  White: '#94a3b8',
};

const sizes = {
  sm: { w: 34, h: 48, numSize: 17, labelSize: 8, honorSize: 19 },
  md: { w: 44, h: 62, numSize: 22, labelSize: 10, honorSize: 24 },
  lg: { w: 54, h: 76, numSize: 28, labelSize: 12, honorSize: 30 },
};

export default function TileSVG({
  tile,
  size = 'md',
  selected = false,
  highlighted = false,
  danger = false,
  dimmed = false,
  onClick,
  count,
}: TileSVGProps) {
  const info = TILE_INFO[tile];
  const s = sizes[size];

  const borderColor = danger
    ? '#ef4444'
    : selected
    ? '#60a5fa'
    : highlighted
    ? '#fbbf24'
    : '#475569';

  const strokeWidth = danger || selected || highlighted ? 2.5 : 1;
  const bgColor = danger ? '#3f1219' : selected ? '#1e3a5f' : '#f8fafc';
  const opacity = dimmed ? 0.35 : 1;

  return (
    <svg
      width={s.w}
      height={s.h}
      viewBox={`0 0 ${s.w} ${s.h}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', opacity }}
      role={onClick ? 'button' : undefined}
      aria-label={info.name}
    >
      {/* Tile body */}
      <rect
        x={1.5}
        y={1.5}
        width={s.w - 3}
        height={s.h - 3}
        rx={4}
        ry={4}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={strokeWidth}
      />

      {info.isHonor ? (
        // Honor tiles: large Chinese character + small English name
        <>
          <text
            x={s.w / 2}
            y={s.h * 0.42}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={s.honorSize}
            fontWeight="bold"
            fill={
              info.name === 'Red' || info.name === 'Green' || info.name === 'White'
                ? DRAGON_COLORS[info.name]
                : '#1e293b'
            }
          >
            {info.displayName}
          </text>
          <text
            x={s.w / 2}
            y={s.h * 0.8}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={s.labelSize - 1}
            fill={danger ? '#fca5a5' : '#64748b'}
          >
            {info.name.slice(0, 1)}
          </text>
        </>
      ) : (
        // Suited tiles: large number + English suit label
        <>
          <text
            x={s.w / 2}
            y={s.h * 0.38}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={s.numSize}
            fontWeight="bold"
            fill={danger ? '#fca5a5' : (SUIT_COLORS[info.suit] ?? '#1e293b')}
          >
            {info.rank}
          </text>
          <text
            x={s.w / 2}
            y={s.h * 0.72}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={s.labelSize}
            fill={danger ? '#fca5a5' : (SUIT_COLORS[info.suit] ?? '#1e293b')}
            opacity={0.8}
          >
            {SUIT_LABELS[info.suit]}
          </text>
        </>
      )}

      {/* Count badge */}
      {count !== undefined && (
        <>
          <circle cx={s.w - 7} cy={7} r={6} fill="#475569" />
          <text
            x={s.w - 7}
            y={7.5}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={8}
            fill="white"
            fontWeight="bold"
          >
            {count}
          </text>
        </>
      )}
    </svg>
  );
}
