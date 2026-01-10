import React from 'react';
import { MessageSquare } from 'lucide-react';
import { SavedRabbitHole } from '../App';

interface HighlightMarkersProps {
  savedRabbitHoles: SavedRabbitHole[];
  onRabbitHoleClick: (rabbitHole: SavedRabbitHole) => void;
}

export function HighlightMarkers({ savedRabbitHoles, onRabbitHoleClick }: HighlightMarkersProps) {
  return (
    <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-gray-100 to-transparent pointer-events-none z-10">
      <div className="relative h-full pointer-events-auto">
        {savedRabbitHoles.map((rabbitHole, index) => (
          <button
            key={rabbitHole.id}
            onClick={() => onRabbitHoleClick(rabbitHole)}
            className="absolute right-2 w-8 h-8 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 group"
            style={{ top: `${(index * 60) + 20}px` }}
            title={`Click to reopen: ${rabbitHole.selectedText}`}
          >
            <MessageSquare className="w-4 h-4" />
            <div className="absolute right-10 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {rabbitHole.selectedText.substring(0, 30)}...
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
