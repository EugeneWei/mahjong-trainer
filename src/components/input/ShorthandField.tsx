import { useState } from 'react';
import { parseNotation, tilesToNotation } from '../../engine/notation';
import { totalTileCount, type TileCounts } from '../../engine/tiles';

interface ShorthandFieldProps {
  onHandChange: (tiles: TileCounts) => void;
  currentHand: TileCounts;
}

export default function ShorthandField({ onHandChange, currentHand }: ShorthandFieldProps) {
  const [input, setInput] = useState(tilesToNotation(currentHand));
  const [error, setError] = useState('');

  const handleChange = (value: string) => {
    setInput(value);
    if (!value.trim()) {
      setError('');
      return;
    }

    const parsed = parseNotation(value);
    if (!parsed) {
      setError('Invalid notation');
      return;
    }

    const count = totalTileCount(parsed);
    if (count > 14) {
      setError(`Too many tiles (${count}/14)`);
      return;
    }

    setError('');
    onHandChange(parsed);
  };

  return (
    <div className="space-y-1">
      <input
        type="text"
        value={input}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="e.g. 123m 456p 789s EEE N"
        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
      />
      {error && <div className="text-xs text-red-400">{error}</div>}
      <div className="text-xs text-slate-500">
        Suits: m/b=bamboo, p/c=characters, s/d=dots. Honors: E S W N R G B
      </div>
    </div>
  );
}
