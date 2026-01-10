import React, { useEffect, useRef } from 'react';
import { Rabbit, Copy, Search, ArrowRight } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  selectedText: string;
  onStartRabbitHole: () => void;
  onClose: () => void;
  isInPopup: boolean;
  onContinueRabbitHole?: () => void;
}

export function ContextMenu({
  x,
  y,
  selectedText,
  onStartRabbitHole,
  onClose,
  isInPopup,
  onContinueRabbitHole,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedText);
    onClose();
  };

  const handleSearch = () => {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(selectedText)}`, '_blank');
    onClose();
  };

  // Adjust position to keep menu on screen
  const adjustedX = Math.min(x, window.innerWidth - 250);
  const adjustedY = Math.min(y, window.innerHeight - 200);

  return (
    <div
      ref={menuRef}
      className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50 min-w-[240px]"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {/* Selected Text Preview */}
      <div className="px-4 py-2 border-b border-gray-100">
        <div className="text-xs text-gray-500 mb-1">Selected text:</div>
        <div className="text-sm text-gray-900 max-w-[200px] truncate">
          "{selectedText}"
        </div>
      </div>

      {/* Menu Items */}
      <div className="py-1">
        {isInPopup && onContinueRabbitHole ? (
          <button
            onClick={onContinueRabbitHole}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-purple-50 text-left group transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center transition-colors">
              <ArrowRight className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900 group-hover:text-purple-900">
                Continue Rabbit Hole
              </div>
              <div className="text-xs text-gray-500">
                Dive deeper into this topic
              </div>
            </div>
          </button>
        ) : (
          <button
            onClick={onStartRabbitHole}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-purple-50 text-left group transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center transition-colors">
              <Rabbit className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900 group-hover:text-purple-900">
                Start Rabbit Hole
              </div>
              <div className="text-xs text-gray-500">
                Explore this concept in depth
              </div>
            </div>
          </button>
        )}

        <button
          onClick={handleCopy}
          className="w-full px-4 py-2 flex items-center gap-3 hover:bg-gray-50 text-left transition-colors"
        >
          <Copy className="w-4 h-4 text-gray-600" />
          <span className="text-sm text-gray-700">Copy</span>
        </button>

        <button
          onClick={handleSearch}
          className="w-full px-4 py-2 flex items-center gap-3 hover:bg-gray-50 text-left transition-colors"
        >
          <Search className="w-4 h-4 text-gray-600" />
          <span className="text-sm text-gray-700">Search Google</span>
        </button>
      </div>
    </div>
  );
}