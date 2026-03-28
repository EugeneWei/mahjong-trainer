import TileSVG from './TileSVG';
import { handToTileList } from '../../engine/hand';
import type { TileCounts, TileIndex } from '../../engine/tiles';

interface TileRowProps {
  tiles: TileCounts;
  size?: 'sm' | 'md' | 'lg';
  selectedTile?: TileIndex | null;
  highlightedTiles?: TileIndex[];
  dangerTiles?: TileIndex[]; // red outline tiles (discard recommendations)
  drawnTile?: TileIndex | null; // show separately above hand with gap
  onTileClick?: (tile: TileIndex) => void;
}

export default function TileRow({
  tiles,
  size = 'md',
  selectedTile = null,
  highlightedTiles = [],
  dangerTiles = [],
  drawnTile = null,
  onTileClick,
}: TileRowProps) {
  const tileList = handToTileList(tiles);
  const highlightSet = new Set(highlightedTiles);
  const dangerSet = new Set(dangerTiles);

  // If we have a drawn tile, separate it from the rest of the hand
  if (drawnTile !== null) {
    // Find the first instance of drawnTile in the list and remove it
    const drawnIdx = tileList.indexOf(drawnTile);
    const handTiles = [...tileList];
    if (drawnIdx !== -1) {
      handTiles.splice(drawnIdx, 1);
    }

    return (
      <div className="space-y-2">
        {/* Drawn tile shown above */}
        <div className="flex justify-center items-center gap-2">
          <span className="text-xs text-emerald-400 font-medium">Drew:</span>
          <TileSVG
            tile={drawnTile}
            size={size}
            highlighted
            onClick={onTileClick ? () => onTileClick(drawnTile) : undefined}
          />
        </div>
        {/* Divider */}
        <div className="border-t border-dashed border-slate-600 mx-4" />
        {/* Main hand */}
        <div className="flex flex-wrap gap-0.5 justify-center">
          {handTiles.map((tile, idx) => (
            <TileSVG
              key={`${tile}-${idx}`}
              tile={tile}
              size={size}
              selected={selectedTile === tile}
              highlighted={highlightSet.has(tile)}
              danger={dangerSet.has(tile)}
              onClick={onTileClick ? () => onTileClick(tile) : undefined}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-0.5 justify-center">
      {tileList.map((tile, idx) => (
        <TileSVG
          key={`${tile}-${idx}`}
          tile={tile}
          size={size}
          selected={selectedTile === tile}
          highlighted={highlightSet.has(tile)}
          danger={dangerSet.has(tile)}
          onClick={onTileClick ? () => onTileClick(tile) : undefined}
        />
      ))}
    </div>
  );
}
