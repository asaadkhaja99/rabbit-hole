import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, GripHorizontal } from 'lucide-react';

interface FigureTooltipProps {
  imageDataUrl: string;
  caption: string;
  figureNumber: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function FigureTooltip({
  imageDataUrl,
  caption,
  figureNumber,
  position,
  onClose,
}: FigureTooltipProps) {
  const initialWidth = 600;
  const initialHeight = 500;
  const padding = 20;

  // Calculate initial position - place to the right of click, or left if no space
  const getInitialPosition = () => {
    let left = position.x + 10;
    let top = position.y - initialHeight / 2;

    if (left + initialWidth > window.innerWidth - padding) {
      left = position.x - initialWidth - 10;
    }
    if (top < padding) {
      top = padding;
    } else if (top + initialHeight > window.innerHeight - padding) {
      top = window.innerHeight - initialHeight - padding;
    }
    return { left, top };
  };

  const [pos, setPos] = useState(getInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag from header, not from close button
    if ((e.target as HTMLElement).closest('button')) return;

    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - pos.left,
      y: e.clientY - pos.top,
    };
    e.preventDefault();
  }, [pos.left, pos.top]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPos({
        left: e.clientX - dragOffset.current.x,
        top: e.clientY - dragOffset.current.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      className="fixed bg-white rounded-lg shadow-2xl border border-slate-200 flex flex-col"
      style={{
        left: pos.left,
        top: pos.top,
        width: initialWidth,
        height: initialHeight,
        minWidth: 250,
        minHeight: 200,
        maxWidth: '90vw',
        maxHeight: '90vh',
        resize: 'both',
        overflow: 'hidden',
        zIndex: 99999,
      }}
    >
      {/* Header - draggable */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-slate-200 flex-shrink-0 cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <span className="text-sm font-medium text-slate-700">
          Figure {figureNumber}
        </span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-200 rounded transition-colors"
        >
          <X className="w-3 h-3 text-slate-500" />
        </button>
      </div>

      {/* Image - scrollable container */}
      <div className="flex-1 p-2 overflow-auto min-h-0">
        <img
          src={imageDataUrl}
          alt={`Figure ${figureNumber}`}
          className="w-full h-auto rounded"
          style={{ minWidth: '100%' }}
        />
      </div>

      {/* Caption preview - fixed */}
      {caption && (
        <div className="px-3 py-2 border-t border-slate-100 flex-shrink-0">
          <p className="text-xs text-slate-500 line-clamp-2" title={caption}>
            {caption}
          </p>
        </div>
      )}

      {/* Resize handle indicator */}
      <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-50 hover:opacity-100">
        <svg viewBox="0 0 24 24" className="w-full h-full text-slate-400">
          <path fill="currentColor" d="M22 22H20V20H22V22M22 18H20V16H22V18M18 22H16V20H18V22M18 18H16V16H18V18M14 22H12V20H14V22M22 14H20V12H22V14Z" />
        </svg>
      </div>
    </div>
  );
}
