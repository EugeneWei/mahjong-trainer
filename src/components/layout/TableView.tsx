// Table view component
// Shows the game table with human's hand at bottom, 3 opponents' info around the edges,
// and game info in the center. Each opponent shows face-down tiles + open melds + river.

import PlayerPanel from '../tiles/PlayerPanel';
import DiscardRiver from '../tiles/DiscardRiver';
import TileRow from '../tiles/TileRow';
import TileSVG from '../tiles/TileSVG';
import type { GameState } from '../../engine/game-sim';
import { getWallRemaining } from '../../engine/game-sim';
import { totalTileCount } from '../../engine/tiles';
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
  prompt?: string;
  children?: React.ReactNode;
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
  const humanPlayer = players[0];

  // Player 0 = human (bottom), 1 = right, 2 = top, 3 = left
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

      {/* Opponent panels — stacked vertically on mobile */}
      <div className="space-y-2">
        {/* Top opponent (across) */}
        <div className="bg-slate-800/30 rounded-lg p-2">
          <PlayerPanel player={topPlayer} compact tilesPerRow={6} />
        </div>

        {/* Left and Right opponents side by side */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-800/30 rounded-lg p-2">
            <PlayerPanel player={leftPlayer} compact tilesPerRow={5} />
          </div>
          <div className="bg-slate-800/30 rounded-lg p-2">
            <PlayerPanel player={rightPlayer} compact tilesPerRow={5} />
          </div>
        </div>
      </div>

      {/* Center area */}
      {children}

      {/* Human's open melds (if any) */}
      {humanPlayer.openMelds.length > 0 && (
        <div className="bg-slate-800/40 rounded-lg p-2">
          <div className="text-xs text-blue-400 font-medium mb-1">Your Open Melds</div>
          <div className="flex flex-wrap gap-2">
            {humanPlayer.openMelds.map((meld, idx) => (
              <div key={idx} className="flex gap-px items-end bg-slate-700/30 rounded px-1.5 py-1">
                <span className="text-[9px] text-slate-500 mr-1 self-center">
                  {meld.type === 'pong' ? 'Pong' : 'Chow'}
                </span>
                {meld.tiles.map((tile, tidx) => (
                  <TileSVG key={tidx} tile={tile} size="sm" />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Human's discard river */}
      {humanPlayer.discards.length > 0 && (
        <div className="bg-slate-800/30 rounded-lg p-2">
          <DiscardRiver
            discards={humanPlayer.discards}
            seatWind={humanPlayer.seatWind}
            isHuman
            compact
          />
        </div>
      )}

      {/* Action prompt — prominent, right above the hand */}
      {prompt && (
        <div className="bg-blue-900/40 border border-blue-700/50 rounded-lg px-4 py-3 text-center">
          <div className="text-base font-bold text-blue-200">{prompt}</div>
        </div>
      )}

      {/* Human's closed hand (large tiles at bottom) */}
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="text-xs text-slate-400 mb-2">
          Your Hand ({WIND_NAMES[humanPlayer.seatWind]})
          {humanPlayer.openMelds.length > 0 && (
            <span className="text-amber-400 ml-1">(Open)</span>
          )}
        </div>
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
