// Face-down tile — represents a hidden tile in another player's hand

interface FaceDownTileProps {
  size?: 'sm' | 'md';
}

const sizes = {
  sm: { w: 22, h: 32 },
  md: { w: 28, h: 40 },
};

export default function FaceDownTile({ size = 'sm' }: FaceDownTileProps) {
  const s = sizes[size];
  return (
    <svg width={s.w} height={s.h} viewBox={`0 0 ${s.w} ${s.h}`}>
      <rect
        x={1}
        y={1}
        width={s.w - 2}
        height={s.h - 2}
        rx={2}
        ry={2}
        fill="#1e3a5f"
        stroke="#334155"
        strokeWidth={1}
      />
      {/* Simple decorative pattern on the back */}
      <rect
        x={3}
        y={3}
        width={s.w - 6}
        height={s.h - 6}
        rx={1}
        fill="none"
        stroke="#2563eb"
        strokeWidth={0.5}
        opacity={0.3}
      />
    </svg>
  );
}
