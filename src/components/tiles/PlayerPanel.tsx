// Player panel: shows an opponent's visible state
// - Open melds (face-up claimed tiles)
// - Face-down tiles representing their closed hand
// - Discard river

import TileSVG from './TileSVG';
import FaceDownTile from './FaceDownTile';
import DiscardRiver from './DiscardRiver';
import type { OpenMeld, PlayerState } from '../../engine/game-sim';
import { totalTileCount } from '../../engine/tiles';

const WIND_LABELS: Record<number, string> = {
  0: 'East', 1: 'South', 2: 'West', 3: 'North',
};

interface PlayerPanelProps {
  player: PlayerState;
  compact?: boolean;
  tilesPerRow?: number;
}

export default function PlayerPanel({ player, compact = false, tilesPerRow = 6 }: PlayerPanelProps) {
  const closedTileCount = totalTileCount(player.hand);
  const hasOpenMelds = player.openMelds.length > 0;

  return (
    <div className="space-y-1.5">
      {/* Player label */}
      <div className={`text-xs font-medium ${player.isHuman ? 'text-blue-400' : 'text-slate-500'}`}>
        {WIND_LABELS[player.seatWind]}
        {player.isHuman && ' (You)'}
        <span className="text-slate-600 ml-1">
          ({closedTileCount} tiles{hasOpenMelds ? ` + ${player.openMelds.length} meld${player.openMelds.length > 1 ? 's' : ''}` : ''})
        </span>
      </div>

      {/* Open melds (face-up, claimed from other players) */}
      {hasOpenMelds && (
        <div className="flex flex-wrap gap-2">
          {player.openMelds.map((meld, idx) => (
            <OpenMeldDisplay key={idx} meld={meld} />
          ))}
        </div>
      )}

      {/* Face-down closed hand tiles */}
      {!player.isHuman && closedTileCount > 0 && (
        <div className="flex flex-wrap gap-px">
          {Array.from({ length: closedTileCount }, (_, i) => (
            <FaceDownTile key={i} size="sm" />
          ))}
        </div>
      )}

      {/* Discard river */}
      {player.discards.length > 0 && (
        <DiscardRiver
          discards={player.discards}
          seatWind={player.seatWind}
          isHuman={player.isHuman}
          compact={compact}
          tilesPerRow={tilesPerRow}
          hideLabel
        />
      )}
      {player.discards.length === 0 && (
        <div className="text-xs text-slate-600 italic">No discards</div>
      )}
    </div>
  );
}

function OpenMeldDisplay({ meld }: { meld: OpenMeld }) {
  return (
    <div className="flex gap-px items-end bg-slate-700/30 rounded px-1 py-0.5">
      <span className="text-[9px] text-slate-500 mr-0.5 self-center">
        {meld.type === 'pong' ? 'P' : 'C'}
      </span>
      {meld.tiles.map((tile, idx) => (
        <TileSVG key={idx} tile={tile} size="sm" />
      ))}
    </div>
  );
}
