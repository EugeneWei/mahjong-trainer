// Discard river display component
// Shows a player's discarded tiles in a compact grid (6 tiles per row)

import TileSVG from './TileSVG';
import type { TileIndex, Wind } from '../../engine/tiles';

const WIND_LABELS: Record<number, string> = {
  0: 'East',
  1: 'South',
  2: 'West',
  3: 'North',
};

interface DiscardRiverProps {
  discards: TileIndex[];
  seatWind: Wind;
  label?: string;
  isHuman?: boolean;
  compact?: boolean;  // smaller tiles for table layout
  tilesPerRow?: number;
  hideLabel?: boolean;
}

export default function DiscardRiver({
  discards,
  seatWind,
  label,
  isHuman = false,
  compact = false,
  tilesPerRow = 6,
  hideLabel = false,
}: DiscardRiverProps) {
  const displayLabel = label ?? `${WIND_LABELS[seatWind]}${isHuman ? ' (You)' : ''}`;
  const tileSize = compact ? 'sm' : 'sm';

  // Group discards into rows
  const rows: TileIndex[][] = [];
  for (let i = 0; i < discards.length; i += tilesPerRow) {
    rows.push(discards.slice(i, i + tilesPerRow));
  }

  return (
    <div className="space-y-0.5">
      {!hideLabel && (
        <div className={`text-xs font-medium ${isHuman ? 'text-blue-400' : 'text-slate-500'}`}>
          {displayLabel}
          {discards.length > 0 && (
            <span className="text-slate-600 ml-1">({discards.length})</span>
          )}
        </div>
      )}
      {discards.length === 0 && !hideLabel ? (
        <div className="text-xs text-slate-600 italic">No discards</div>
      ) : discards.length > 0 ? (
        <div className="space-y-0">
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex gap-px">
              {row.map((tile, tileIdx) => {
                const isLast = rowIdx === rows.length - 1 && tileIdx === row.length - 1;
                return (
                  <TileSVG
                    key={`${rowIdx}-${tileIdx}`}
                    tile={tile}
                    size={tileSize}
                    highlighted={isLast}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
