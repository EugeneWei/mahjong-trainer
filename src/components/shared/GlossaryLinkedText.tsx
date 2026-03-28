import { useState, type ReactNode } from 'react';
import { GLOSSARY, type GlossaryEntry } from '../../engine/glossary';

// Automatically finds glossary terms in text and makes them clickable
// Shows a popover on tap with the term's definition

interface GlossaryLinkedTextProps {
  text: string;
  className?: string;
}

// Build a regex that matches any glossary term, longest first to avoid partial matches
const TERM_KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const TERM_REGEX = TERM_KEYS.length > 0
  ? new RegExp(`(${TERM_KEYS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  : null;

export default function GlossaryLinkedText({ text, className = '' }: GlossaryLinkedTextProps) {
  const [activeEntry, setActiveEntry] = useState<GlossaryEntry | null>(null);

  if (!TERM_REGEX) {
    return <span className={className}>{text}</span>;
  }

  // Split text into lines first (preserve whitespace-pre-line behavior)
  const lines = text.split('\n');

  const elements: ReactNode[] = [];
  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) elements.push(<br key={`br-${lineIdx}`} />);

    // For each line, find glossary terms and split around them
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    const regex = new RegExp(TERM_REGEX.source, 'g');
    let match;

    while ((match = regex.exec(line)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      // Add clickable term
      const term = match[0];
      const entry = GLOSSARY[term];
      if (entry) {
        parts.push(
          <button
            key={`${lineIdx}-${match.index}`}
            onClick={() => setActiveEntry(entry)}
            className="text-blue-300 underline underline-offset-2 decoration-blue-500/40 hover:decoration-blue-400"
          >
            {term}
          </button>
        );
      } else {
        parts.push(term);
      }
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last match
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    elements.push(...parts.map((p, i) =>
      typeof p === 'string' ? <span key={`${lineIdx}-t-${i}`}>{p}</span> : p
    ));
  });

  return (
    <>
      <span className={className}>{elements}</span>
      {activeEntry && (
        <GlossaryPopover entry={activeEntry} onClose={() => setActiveEntry(null)} />
      )}
    </>
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
