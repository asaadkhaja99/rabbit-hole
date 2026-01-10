import React from 'react';
import { MessageSquare, Trash2, ChevronRight, ExternalLink } from 'lucide-react';
import { SavedRabbitHole } from '../App';

interface RabbitHoleTooltipProps {
  rabbitHole: SavedRabbitHole;
  x: number;
  y: number;
  onDelete: (rabbitHoleId: string) => void;
  onReopen: (rabbitHole: SavedRabbitHole) => void;
}

export function RabbitHoleTooltip({ rabbitHole, x, y, onDelete, onReopen }: RabbitHoleTooltipProps) {
  // Adjust position to keep tooltip on screen
  const adjustedX = Math.min(x + 10, window.innerWidth - 350);
  const adjustedY = Math.min(y + 10, window.innerHeight - 350);

  return (
    <div
      className="fixed bg-white rounded-lg shadow-2xl border-2 border-green-300 p-4 z-50 max-w-[320px]"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="font-semibold text-gray-900 text-sm">Saved Discovery</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onReopen(rabbitHole)}
            className="p-1 hover:bg-green-100 rounded transition-colors"
            title="Reopen rabbit hole"
          >
            <ExternalLink className="w-4 h-4 text-green-600" />
          </button>
          <button
            onClick={() => onDelete(rabbitHole.id)}
            className="p-1 hover:bg-red-100 rounded transition-colors"
            title="Delete rabbit hole"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      </div>

      {/* Selected Text */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 mb-1">Original text:</div>
        <div className="text-sm italic text-gray-700 bg-gray-50 p-2 rounded border border-gray-200">
          "{rabbitHole.selectedText}"
        </div>
      </div>

      {/* Rabbit Hole Path */}
      {rabbitHole.rabbitHolePath.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-1">Exploration path:</div>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {rabbitHole.rabbitHolePath.map((path, index) => (
              <React.Fragment key={index}>
                <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">
                  {path}
                </span>
                {index < rabbitHole.rabbitHolePath.length - 1 && (
                  <ChevronRight className="w-3 h-3 text-gray-400" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div>
        <div className="text-xs text-gray-500 mb-1">Key insights:</div>
        <div className="text-sm text-gray-700 bg-green-50 p-2 rounded border border-green-200 max-h-32 overflow-y-auto">
          {rabbitHole.summary}
        </div>
      </div>

      {/* Timestamp */}
      <div className="text-xs text-gray-400 mt-3">
        {rabbitHole.timestamp.toLocaleString()}
      </div>

      {/* Reopen Button */}
      <button
        onClick={() => onReopen(rabbitHole)}
        className="mt-3 w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
      >
        <ExternalLink className="w-4 h-4" />
        Reopen Rabbit Hole
      </button>
    </div>
  );
}