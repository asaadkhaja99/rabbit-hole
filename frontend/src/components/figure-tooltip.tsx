import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';

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
  const [zoom, setZoom] = useState(1);
  const dragOffset = useRef({ x: 0, y: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Handle scroll to zoom centered on mouse position
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const container = imageContainerRef.current;
    if (!container) return;

    // Get mouse position relative to container
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Current scroll position
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;

    // Point in image space (accounting for current zoom and scroll)
    const imageX = (scrollLeft + mouseX) / zoom;
    const imageY = (scrollTop + mouseY) / zoom;

    // Calculate new zoom
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(0.5, Math.min(5, zoom + delta));

    // Calculate new scroll position to keep mouse over same image point
    const newScrollLeft = imageX * newZoom - mouseX;
    const newScrollTop = imageY * newZoom - mouseY;

    setZoom(newZoom);

    // Apply scroll after state update
    requestAnimationFrame(() => {
      container.scrollLeft = Math.max(0, newScrollLeft);
      container.scrollTop = Math.max(0, newScrollTop);
    });
  }, [zoom]);

  // Reset zoom on double click
  const handleDoubleClick = useCallback(() => {
    setZoom(1);
    const container = imageContainerRef.current;
    if (container) {
      container.scrollLeft = 0;
      container.scrollTop = 0;
    }
  }, []);

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
        <div className="flex items-center gap-2">
          {zoom !== 1 && (
            <span className="text-xs text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
              {Math.round(zoom * 100)}%
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 rounded transition-colors"
          >
            <X className="w-3 h-3 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Image - scrollable container with zoom */}
      <div
        ref={imageContainerRef}
        className="flex-1 p-2 overflow-auto min-h-0 cursor-zoom-in"
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        title="Scroll to zoom, double-click to reset"
      >
        <img
          src={imageDataUrl}
          alt={`Figure ${figureNumber}`}
          className="rounded transition-transform duration-100"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            width: '100%',
            height: 'auto',
          }}
          draggable={false}
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
