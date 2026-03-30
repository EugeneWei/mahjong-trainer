// Table view component
// Shows the game table with human's hand at bottom, 3 opponents' rivers around the edges,
// and game info in the center.

import DiscardRiver from '../tiles/DiscardRiver';
import TileRow from '../tiles/TileRow';
import type { PlayerState, GameState } from '../../engine/game-sim';
import { getWallRemaining } from '../../engine/game-sim';
import type { TileCounts, TileIndex } from '../../engine/tiles';

const WIND_NAMES = ['East', 'South', 'West', 'North'];

interface TableViewProps {
  gameState: GameState;
  humanHand: TileCounts;
  drawnTile?: TileIndex | null;
  selectedTile?: TileIndex | null;
  dangerTiles?: TileIndex[];
  highlightedTiles?: TileIndex[];
  onTileClick?: (tile: TileIndex) => void;
  prompt?: string; // action prompt shown prominently above the hand
  children?: React.ReactNode; // center area content
}

export default function TableView({
  gameState,
  humanHand,
  drawnTile,
  selectedTile,
  dangerTiles = [],
  highlightedTiles = [],
  onTileClick,
  prompt,
  children,
}: TableViewProps) {
  const wallRemaining = getWallRemaining(gameState);
  const players = gameState.players;

  // Player 0 = human (bottom), 1 = right, 2 = top, 3 = left
  // This matches the standard Mahjong table perspective
  const topPlayer = players[2];
  const leftPlayer = players[3];
  const rightPlayer = players[1];

  return (
    <div className="space-y-3">
      {/* Game info bar */}
      <div className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2 text-xs text-slate-400">
        <span>Turn {gameState.turnNumber}</span>
        <span>{WIND_NAMES[gameState.prevailingWind]} Wind Round</span>
        <span>Wall: {wallRemaining}</span>
      </div>

      {/* Table layout — mobile-first stacked, wider screens use grid */}
      <div className="space-y-2 lg:grid lg:grid-cols-[140px_1fr_140px] lg:grid-rows-[auto_1fr_auto] lg:gap-2 lg:space-y-0">
        {/* Top opponent river (player across) */}
        <div className="lg:col-start-2 lg:col-end-3 lg:row-start-1">
          <div className="bg-slate-800/30 rounded-lg p-2">
            <DiscardRiver
              discards={topPlayer.discards}
              seatWind={topPlayer.seatWind}
              compact
            />
          </div>
        </div>

        {/* Left opponent river */}
        <div className="lg:col-start-1 lg:col-end-2 lg:row-start-2">
          <div className="bg-slate-800/30 rounded-lg p-2">
            <DiscardRiver
              discards={leftPlayer.discards}
              seatWind={leftPlayer.seatWind}
              compact
              tilesPerRow={4}
            />
          </div>
        </div>

        {/* Center area */}
        <div className="lg:col-start-2 lg:col-end-3 lg:row-start-2">
          {children}
        </div>

        {/* Right opponent river */}
        <div className="lg:col-start-3 lg:col-end-4 lg:row-start-2">
          <div className="bg-slate-800/30 rounded-lg p-2">
            <DiscardRiver
              discards={rightPlayer.discards}
              seatWind={rightPlayer.seatWind}
              compact
              tilesPerRow={4}
            />
          </div>
        </div>

        {/* Bottom: human's river */}
        <div className="lg:col-start-2 lg:col-end-3 lg:row-start-3">
          <div className="bg-slate-800/30 rounded-lg p-2">
            <DiscardRiver
              discards={players[0].discards}
              seatWind={players[0].seatWind}
              isHuman
              compact
            />
          </div>
        </div>
      </div>

      {/* Action prompt — prominent, right above the hand */}
      {prompt && (
        <div className="bg-blue-900/40 border border-blue-700/50 rounded-lg px-4 py-3 text-center">
          <div className="text-base font-bold text-blue-200">{prompt}</div>
        </div>
      )}

      {/* Human's hand (large tiles at bottom) */}
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="text-xs text-slate-400 mb-2">Your Hand ({WIND_NAMES[players[0].seatWind]})</div>
        <TileRow
          tiles={humanHand}
          size="lg"
          drawnTile={drawnTile}
          selectedTile={selectedTile}
          dangerTiles={dangerTiles}
          highlightedTiles={highlightedTiles}
          onTileClick={onTileClick}
        />
      </div>
    </div>
  );
}
