import { Wind } from '../../engine/tiles';
import type { GameContext as GameContextType } from '../../engine/hand';

interface GameContextProps {
  context: GameContextType;
  onChange: (ctx: GameContextType) => void;
  readOnly?: boolean;
}

const WIND_CHARS = ['東', '南', '西', '北'];

export default function GameContextPanel({ context, onChange, readOnly = false }: GameContextProps) {
  const windButton = (
    _wind: Wind,
    current: Wind,
    onSelect: (w: Wind) => void,
    label: string
  ) => (
    <div className="flex gap-1" key={label}>
      <span className="text-xs text-slate-400 w-20">{label}:</span>
      <div className="flex gap-1">
        {[Wind.East, Wind.South, Wind.West, Wind.North].map((w) => (
          <button
            key={w}
            onClick={() => !readOnly && onSelect(w)}
            className={`px-2 py-0.5 text-xs rounded ${
              current === w
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
          >
            {WIND_CHARS[w]}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
      {windButton(context.seatWind, context.seatWind, (w) =>
        onChange({ ...context, seatWind: w }), 'Seat Wind'
      )}
      {windButton(context.prevailingWind, context.prevailingWind, (w) =>
        onChange({ ...context, prevailingWind: w }), 'Round Wind'
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 w-20">Wall tiles:</span>
        <input
          type="range"
          min={0}
          max={84}
          value={context.wallRemaining}
          onChange={(e) =>
            !readOnly && onChange({ ...context, wallRemaining: parseInt(e.target.value) })
          }
          className="flex-1 h-1 accent-blue-500"
          disabled={readOnly}
        />
        <span className="text-xs text-slate-300 w-8 text-right">{context.wallRemaining}</span>
      </div>
      <div className="text-xs text-slate-500">
        {context.wallRemaining > 60
          ? 'Early game'
          : context.wallRemaining > 30
          ? 'Mid game'
          : 'Late game'}
      </div>
    </div>
  );
}
