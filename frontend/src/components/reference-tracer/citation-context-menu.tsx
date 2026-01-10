import React, { useEffect, useRef } from 'react';
import { Rabbit, BookOpen } from 'lucide-react';
import type { CitationMatch } from '../../utils/reference-detector';
import type { BibliographyEntry } from '../../utils/bibliography-parser';

interface CitationContextMenuProps {
  citation: CitationMatch;
  bibliographyEntry?: BibliographyEntry;
  position: { x: number; y: number };
  onStartRabbitHole: () => void;
  onClose: () => void;
}

export function CitationContextMenu({
  citation,
  bibliographyEntry,
  position,
  onStartRabbitHole,
  onClose,
}: CitationContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Close on escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Calculate position to keep menu on screen
  const menuWidth = 280;
  const left = Math.min(position.x, window.innerWidth - menuWidth - 20);
  const top = position.y;

  return (
    <div
      ref={menuRef}
      className="fixed z-[60000] bg-white rounded-lg shadow-xl border border-slate-200 py-1 overflow-hidden"
      style={{
        left,
        top,
        width: menuWidth,
      }}
    >
      {/* Reference info header */}
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-4 h-4 text-slate-500 flex-shrink-0" strokeWidth={1.5} />
          <span className="text-xs font-medium text-slate-600">
            Reference {citation.text}
          </span>
        </div>
        {bibliographyEntry ? (
          <p className="text-sm text-slate-700 line-clamp-2" title={bibliographyEntry.rawText}>
            {bibliographyEntry.title || bibliographyEntry.rawText.slice(0, 80)}
          </p>
        ) : (
          <p className="text-sm text-slate-400 italic">
            Reference not found in bibliography
          </p>
        )}
        {bibliographyEntry?.authors && bibliographyEntry.authors.length > 0 && (
          <p className="text-xs text-slate-500 mt-1">
            {bibliographyEntry.authors.length > 2
              ? `${bibliographyEntry.authors[0]} et al.`
              : bibliographyEntry.authors.join(', ')}
            {bibliographyEntry.year && ` (${bibliographyEntry.year})`}
          </p>
        )}
      </div>

      {/* Menu items */}
      <button
        onClick={() => {
          onStartRabbitHole();
          onClose();
        }}
        disabled={!bibliographyEntry}
        className="w-full px-3 py-2.5 text-left text-sm hover:bg-emerald-50 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
      >
        <Rabbit className="w-4 h-4 text-emerald-600" strokeWidth={1.5} />
        <span className="font-medium">Start Rabbit Hole</span>
      </button>
    </div>
  );
}
