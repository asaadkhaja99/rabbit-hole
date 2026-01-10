import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import {
  PdfLoader,
  PdfHighlighter,
  TextHighlight,
  AreaHighlight,
  useHighlightContainerContext,
} from 'react-pdf-highlighter-extended';
import type { Highlight, PdfSelection, ScaledPosition, PdfHighlighterUtils } from 'react-pdf-highlighter-extended';
import { FileQuestion, Rabbit } from 'lucide-react';
import { SavedRabbitHole, RabbitHoleWindow } from '../App';
import { HighlightMarkers } from './highlight-markers';
import { ContextMenu } from './context-menu';
import 'react-pdf-highlighter-extended/dist/esm/style/PdfHighlighter.css';
import 'react-pdf-highlighter-extended/dist/esm/style/TextHighlight.css';
import 'react-pdf-highlighter-extended/dist/esm/style/AreaHighlight.css';
import 'react-pdf-highlighter-extended/dist/esm/style/MouseSelection.css';

// Fix version mismatch: worker version must match the bundled pdfjs-dist version
const PDFJS_WORKER_SRC = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

interface PdfViewerProps {
  file: string | null;
  currentPage: number;
  numPages: number | null;
  onPageChange: (page: number) => void;
  onDocumentLoad: (numPages: number) => void;
  onStartRabbitHole: (selectedText: string, pageReference: number, parentId?: string, highlightPosition?: ScaledPosition) => void;
  savedRabbitHoles: SavedRabbitHole[];
  onDeleteRabbitHole: (rabbitHoleId: string) => void;
  onReopenRabbitHole: (rabbitHole: SavedRabbitHole) => void;
  activeRabbitHoles: RabbitHoleWindow[];
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  scrollToHighlightId?: string | null;
  onScrollComplete?: () => void;
}

// Custom highlight type that includes our metadata
interface AppHighlight extends Highlight {
  type: 'text' | 'area';
  commentId?: string;
  rabbitHoleId?: string;
  isActive?: boolean;
}

// Highlight container component
function HighlightContainer({
  savedRabbitHoles,
  onReopenRabbitHole,
}: {
  savedRabbitHoles: SavedRabbitHole[];
  onReopenRabbitHole: (rabbitHole: SavedRabbitHole) => void;
}) {
  const { highlight, viewportPosition, isScrolledTo } = useHighlightContainerContext<AppHighlight>();

  const isActive = highlight.isActive;

  const highlightColor = isActive
    ? 'rgba(167, 139, 250, 0.35)' // light purple for active rabbit holes
    : 'rgba(34, 197, 94, 0.3)'; // green for saved rabbit holes

  const handleClick = () => {
    if (highlight.commentId) {
      const rabbitHole = savedRabbitHoles.find(rh => rh.id === highlight.commentId);
      if (rabbitHole) {
        onReopenRabbitHole(rabbitHole);
      }
    }
  };

  if (highlight.type === 'area') {
    return (
      <AreaHighlight
        highlight={highlight}
        isScrolledTo={isScrolledTo}
        bounds={viewportPosition.boundingRect}
        style={{ background: highlightColor }}
        onClick={handleClick}
      />
    );
  }

  return (
    <TextHighlight
      highlight={highlight}
      isScrolledTo={isScrolledTo}
      style={{ background: highlightColor }}
      onClick={handleClick}
    />
  );
}

// Selection tooltip component - appears near the text selection
function SelectionTooltip({
  selection,
  onStartRabbitHole,
}: {
  selection: PdfSelection;
  onStartRabbitHole: (text: string, page: number, position: ScaledPosition) => void;
}) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const text = selection.content.text || '';
  const pageNumber = selection.position.boundingRect.pageNumber;

  // Get actual screen position from browser selection
  useEffect(() => {
    const browserSelection = window.getSelection();
    if (browserSelection && browserSelection.rangeCount > 0) {
      const range = browserSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    }
  }, [selection]);

  if (!position) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y - 8,
        transform: 'translate(-50%, -100%)',
        zIndex: 9999,
      }}
    >
      <button
        onClick={() => {
          onStartRabbitHole(text, pageNumber, selection.position);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: '#9333ea',
          color: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: '14px',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          border: 'none',
          cursor: 'pointer',
        }}
        title={`"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`}
      >
        <Rabbit style={{ width: 16, height: 16 }} />
        Start Rabbit Hole
      </button>
      {/* Arrow pointer */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: '-6px',
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid #9333ea',
        }}
      />
    </div>
  );
}

export function PdfViewer({
  file,
  currentPage,
  numPages,
  onPageChange,
  onDocumentLoad,
  onStartRabbitHole,
  savedRabbitHoles,
  onDeleteRabbitHole,
  onReopenRabbitHole,
  activeRabbitHoles,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  scrollToHighlightId,
  onScrollComplete,
}: PdfViewerProps) {
  const highlighterUtilsRef = useRef<PdfHighlighterUtils>();
  const [currentSelection, setCurrentSelection] = useState<PdfSelection | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    text: string;
    page: number;
    position: ScaledPosition;
  } | null>(null);

  // Clear selection tooltip when text is deselected
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      if (!selectedText) {
        setCurrentSelection(null);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  // Handle right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Always prevent browser default context menu
    e.preventDefault();

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    // Only show custom menu if text is selected
    if (selectedText) {
      // Use currentSelection if available, otherwise create a basic position
      const position = currentSelection?.position || {
        boundingRect: { pageNumber: currentPage, x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0 },
        rects: [],
      };

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        text: selectedText,
        page: position.boundingRect.pageNumber || currentPage,
        position: position as ScaledPosition,
      });
      setCurrentSelection(null); // Hide the tooltip when showing context menu
    }
  }, [currentSelection, currentPage]);

  // Convert savedRabbitHoles and active rabbit holes to highlights
  const highlights = useMemo((): AppHighlight[] => {
    const result: AppHighlight[] = [];

    // Add saved rabbit hole highlights (green)
    savedRabbitHoles.forEach(rabbitHole => {
      if (rabbitHole.highlightPosition) {
        result.push({
          id: `rabbithole-${rabbitHole.id}`,
          type: 'text',
          position: rabbitHole.highlightPosition,
          commentId: rabbitHole.id,  // Keep commentId field name for now to minimize changes
          isActive: false,
        });
      }
    });

    // Add active rabbit hole highlights (purple)
    activeRabbitHoles.forEach(rh => {
      if (rh.highlightPosition) {
        result.push({
          id: `rabbit-${rh.id}`,
          type: 'text',
          position: rh.highlightPosition,
          rabbitHoleId: rh.id,
          isActive: true,
        });
      }
    });

    return result;
  }, [savedRabbitHoles, activeRabbitHoles]);

  // Scroll to highlight when scrollToHighlightId changes
  useEffect(() => {
    if (scrollToHighlightId && highlighterUtilsRef.current) {
      const highlight = highlights.find(h => h.id === scrollToHighlightId);
      if (highlight) {
        // Small delay to ensure the page has rendered
        setTimeout(() => {
          highlighterUtilsRef.current?.scrollToHighlight(highlight);
          onScrollComplete?.();
        }, 100);
      }
    }
  }, [scrollToHighlightId, highlights, onScrollComplete]);

  // Smooth zoom: update PDF viewer scale directly without remounting
  useEffect(() => {
    const viewer = highlighterUtilsRef.current?.getViewer();
    if (viewer && viewer.currentScale !== zoomLevel) {
      viewer.currentScale = zoomLevel;
    }
  }, [zoomLevel]);

  const handleSelection = useCallback((selection: PdfSelection) => {
    if (selection.content.text && selection.content.text.trim().length > 0) {
      setCurrentSelection(selection);
    }
  }, []);

  const handleStartRabbitHole = useCallback((text: string, page: number, position: ScaledPosition) => {
    onStartRabbitHole(text, page, undefined, position);
    setCurrentSelection(null);
    setContextMenu(null);
  }, [onStartRabbitHole]);

  // Track page changes from scroll
  const handleScrollToPage = useCallback((page: number) => {
    onPageChange(page);
  }, [onPageChange]);

  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <FileQuestion className="w-24 h-24 mb-4" />
        <p className="text-xl font-medium">No PDF loaded</p>
        <p className="text-sm mt-2">Upload a PDF to get started</p>
        <p className="text-sm mt-4 text-center max-w-md text-gray-500">
          💡 Select text to start exploring concepts
        </p>
      </div>
    );
  }

  const pageRabbitHoles = savedRabbitHoles.filter(rh => rh.pageReference === currentPage);

  return (
    <div className="h-full flex flex-col relative" onContextMenu={handleContextMenu}>
      <PdfLoader document={file} workerSrc={PDFJS_WORKER_SRC}>
        {(pdfDocument) => {
          // Update numPages when document loads
          if (pdfDocument.numPages !== numPages) {
            onDocumentLoad(pdfDocument.numPages);
          }

          return (
            <PdfHighlighter
              pdfDocument={pdfDocument}
              highlights={highlights}
              onSelection={handleSelection}
              utilsRef={(utils) => {
                highlighterUtilsRef.current = utils;
              }}
              pdfScaleValue={zoomLevel}
              textSelectionColor="rgba(147, 51, 234, 0.4)"
              style={{ height: '100%' }}
            >
              <HighlightContainer
                savedRabbitHoles={savedRabbitHoles}
                onReopenRabbitHole={onReopenRabbitHole}
              />
            </PdfHighlighter>
          );
        }}
      </PdfLoader>

      {/* Selection tooltip */}
      {currentSelection && !contextMenu && (
        <SelectionTooltip
          selection={currentSelection}
          onStartRabbitHole={(text, page, position) => {
            handleStartRabbitHole(text, page, position);
            setCurrentSelection(null);
          }}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedText={contextMenu.text}
          onStartRabbitHole={() => {
            handleStartRabbitHole(contextMenu.text, contextMenu.page, contextMenu.position);
          }}
          onClose={() => setContextMenu(null)}
          isInPopup={false}
        />
      )}

      {/* Highlight Markers for Rabbit Holes */}
      {pageRabbitHoles.length > 0 && (
        <div className="absolute right-0 top-16 bottom-0 z-20">
          <HighlightMarkers
            savedRabbitHoles={pageRabbitHoles}
            onRabbitHoleClick={onReopenRabbitHole}
          />
        </div>
      )}
    </div>
  );
}
