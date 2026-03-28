import { useState } from 'react';
import TileSVG from '../tiles/TileSVG';
import type { AnalysisResult, DiscardOption, HandPath, TileGroup } from '../../engine/analysis';
import { tileFullName } from '../../engine/analysis';
import { GLOSSARY, type GlossaryEntry } from '../../engine/glossary';
import GlossaryLinkedText from '../shared/GlossaryLinkedText';

interface AnalysisPanelProps {
  result: AnalysisResult;
  showTopN?: number;
  showPaths?: boolean;
}

export default function AnalysisPanel({ result, showTopN = 5, showPaths = true }: AnalysisPanelProps) {
  const topDiscards = result.discards.slice(0, showTopN);
  const [glossaryTerm, setGlossaryTerm] = useState<GlossaryEntry | null>(null);

  return (
    <div className="space-y-4">
      {/* Glossary popover */}
      {glossaryTerm && (
        <GlossaryPopover entry={glossaryTerm} onClose={() => setGlossaryTerm(null)} />
      )}

      {/* Shanten display */}
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${shantenColor(result.currentShanten)}`}>
            {result.currentShanten === -1 ? 'WIN' : result.currentShanten}
          </span>
          <span className="text-sm text-slate-400">{result.handDescription}</span>
        </div>
      </div>

      {/* Tile groups — visual meld breakdown */}
      {result.tileGroups.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Your Melds & Groups</h3>
          <div className="space-y-2">
            {result.tileGroups.map((group, idx) => (
              <TileGroupRow key={idx} group={group} />
            ))}
          </div>
        </div>
      )}

      {/* Rich hand analysis */}
      {result.handAnalysis && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Hand Analysis</h3>
          <GlossaryLinkedText text={result.handAnalysis} className="text-xs text-slate-400 leading-relaxed" />
        </div>
      )}

      {/* Winning paths */}
      {showPaths && result.winningPaths.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Paths to Victory</h3>
          <div className="space-y-3">
            {result.winningPaths.map((path, idx) => (
              <PathCard key={idx} path={path} onTermClick={setGlossaryTerm} />
            ))}
          </div>
        </div>
      )}

      {/* Discard recommendations */}
      {result.currentShanten >= 0 && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Recommended Discards</h3>
          <div className="space-y-3">
            {topDiscards.map((d, idx) => (
              <DiscardRow key={d.tile} option={d} rank={idx + 1} isBest={idx === 0} onTermClick={setGlossaryTerm} />
            ))}
          </div>
        </div>
      )}

      {/* Reachable winning tiles */}
      {topDiscards.length > 0 && topDiscards[0].reachableHands.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <h3 className="text-sm font-medium text-slate-300 mb-2">
            Winning Tiles (after discarding {tileFullName(topDiscards[0].tile)})
          </h3>
          <div className="space-y-2">
            {topDiscards[0].reachableHands.map((h, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs p-2 bg-slate-700/30 rounded">
                <TileSVG tile={h.winningTile} size="sm" highlighted={h.fanValue >= 3} />
                <div className="flex-1">
                  <div className="text-slate-300 font-medium">{h.description}</div>
                  <div className="text-slate-500 mt-0.5">
                    {(h.probability * 100).toFixed(1)}% chance
                    {h.fanValue >= 3 ? ` · EV: ${h.ev.toFixed(2)}` : ''}
                  </div>
                  {h.patterns.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {h.patterns.map((p, i) => (
                        <GlossaryChip key={i} term={p} onClick={setGlossaryTerm} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Visual display of a tile group
function TileGroupRow({ group }: { group: TileGroup }) {
  const typeLabels: Record<string, { label: string; color: string }> = {
    'triplet': { label: 'Pong', color: 'text-green-400' },
    'sequence': { label: 'Chow', color: 'text-blue-400' },
    'pair': { label: 'Pair', color: 'text-yellow-400' },
    'partial-seq': { label: 'Partial', color: 'text-orange-400' },
    'isolated': { label: 'Isolated', color: 'text-red-400' },
  };

  const { label, color } = typeLabels[group.type] || { label: group.type, color: 'text-slate-400' };

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-medium w-14 ${color}`}>{label}</span>
      <div className="flex gap-0.5">
        {group.tiles.map((t, idx) => (
          <TileSVG key={`${t}-${idx}`} tile={t} size="sm" />
        ))}
      </div>
      {group.type === 'partial-seq' && (
        <span className="text-xs text-slate-500 ml-1">{group.label.split('—')[1]?.trim()}</span>
      )}
    </div>
  );
}

function PathCard({ path, onTermClick }: { path: HandPath; onTermClick: (e: GlossaryEntry) => void }) {
  return (
    <div className="p-2 bg-slate-700/30 rounded">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-amber-400">{path.fan} fan</span>
        <GlossaryChip term={path.name} onClick={onTermClick} />
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{path.description}</p>
      {path.tilesNeeded.length > 0 && (
        <div className="mt-1.5">
          <span className="text-xs text-slate-500">Tiles needed: </span>
          <div className="flex gap-0.5 mt-0.5 flex-wrap">
            {path.tilesNeeded.map((t) => (
              <TileSVG key={t} tile={t} size="sm" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DiscardRow({ option, rank, isBest, onTermClick }: {
  option: DiscardOption;
  rank: number;
  isBest: boolean;
  onTermClick: (e: GlossaryEntry) => void;
}) {
  return (
    <div className={`p-2 rounded ${isBest ? 'bg-blue-900/30 border border-blue-700/50' : 'bg-slate-700/30'}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 w-4">{rank}.</span>
        <TileSVG tile={option.tile} size="sm" danger={isBest} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium ${shantenColor(option.shanten)}`}>
              Shanten: {option.shanten}
            </span>
            <span className="text-xs text-slate-500">
              {option.acceptance} improving draws
            </span>
            {option.ev > 0 && (
              <span className="text-xs text-amber-400">EV: {option.ev.toFixed(1)}</span>
            )}
          </div>
        </div>
      </div>
      {option.explanation && (
        <p className="text-xs text-slate-400 mt-1.5 ml-6 leading-relaxed">{option.explanation}</p>
      )}
      {/* Improving tiles shown graphically */}
      {option.acceptanceTiles.length > 0 && (
        <div className="mt-1.5 ml-6">
          <span className="text-xs text-slate-500">Tiles that improve your hand:</span>
          <div className="flex gap-0.5 mt-0.5 flex-wrap">
            {option.acceptanceTiles.map((t) => (
              <TileSVG key={t} tile={t} size="sm" />
            ))}
          </div>
        </div>
      )}
      {/* Scoring patterns as clickable chips */}
      {option.reachableHands.length > 0 && (
        <div className="mt-1 ml-6 flex flex-wrap gap-1">
          {[...new Set(option.reachableHands.flatMap(h => h.patterns))].map((p, i) => (
            <GlossaryChip key={i} term={p} onClick={onTermClick} />
          ))}
        </div>
      )}
    </div>
  );
}

// Clickable chip that opens glossary popover
function GlossaryChip({ term, onClick }: { term: string; onClick: (e: GlossaryEntry) => void }) {
  const entry = GLOSSARY[term];
  if (!entry) {
    return <span className="text-xs text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded">{term}</span>;
  }
  return (
    <button
      onClick={() => onClick(entry)}
      className="text-xs text-blue-300 bg-blue-900/30 px-1.5 py-0.5 rounded hover:bg-blue-900/50 border border-blue-700/30"
    >
      {term}
    </button>
  );
}

function GlossaryPopover({ entry, onClose }: { entry: GlossaryEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-slate-800 rounded-xl p-4 max-w-sm w-full border border-slate-600 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="text-base font-bold text-slate-200">{entry.english}</h3>
            {entry.chinese && (
              <span className="text-sm text-slate-400">{entry.chinese}</span>
            )}
          </div>
          <span className="text-sm font-bold text-amber-400">{entry.fan} fan</span>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed mb-2">{entry.description}</p>
        {entry.example && (
          <div className="text-xs text-slate-500 bg-slate-700/50 rounded p-2">
            <span className="font-medium">Example: </span>{entry.example}
          </div>
        )}
        <button
          onClick={onClose}
          className="mt-3 w-full text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 py-1.5 rounded"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function shantenColor(shanten: number): string {
  if (shanten === -1) return 'text-green-400';
  if (shanten === 0) return 'text-yellow-400';
  if (shanten === 1) return 'text-orange-400';
  return 'text-red-400';
}
