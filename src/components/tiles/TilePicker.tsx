import TileSVG from './TileSVG';
import { NUM_TILE_TYPES, TILES_PER_TYPE, WINDS_START, type TileCounts } from '../../engine/tiles';

interface TilePickerProps {
  currentHand: TileCounts;
  onTileAdd: (tile: number) => void;
  onTileRemove: (tile: number) => void;
  maxTiles: number;
  currentCount: number;
}

export default function TilePicker({
  currentHand,
  onTileAdd,
  onTileRemove,
  maxTiles,
  currentCount,
}: TilePickerProps) {
  const isFull = currentCount >= maxTiles;

  const renderRow = (start: number, end: number, label: string) => (
    <div className="mb-2">
      <div className="text-xs text-slate-500 mb-1 text-left pl-1">{label}</div>
      <div className="flex flex-wrap gap-0.5">
        {Array.from({ length: end - start }, (_, i) => {
          const tile = start + i;
          const inHand = currentHand[tile];
          const remaining = TILES_PER_TYPE - inHand;
          const canAdd = remaining > 0 && !isFull;

          return (
            <div key={tile} className="relative">
              <TileSVG
                tile={tile}
                size="sm"
                dimmed={remaining === 0}
                onClick={() => {
                  if (canAdd) onTileAdd(tile);
                  else if (inHand > 0) onTileRemove(tile);
                }}
                count={inHand > 0 ? inHand : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <div className="text-sm text-slate-400 mb-2">
        Tap to add/remove tiles ({currentCount}/{maxTiles})
      </div>
      {renderRow(0, 9, 'Bamboo')}
      {renderRow(9, 18, 'Characters')}
      {renderRow(18, 27, 'Dots')}
      {renderRow(WINDS_START, NUM_TILE_TYPES, 'Honors')}
    </div>
  );
}
