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
import { FigureTooltip } from './figure-tooltip';
import { EquationTooltip } from './equation-tooltip';
import { type EquationAnnotation } from './equation-annotation';
import { extractFiguresFromPage, captureFigureRegion, type FigureInfo } from '../utils/figure-extractor';
import { extractEquationsFromPage, captureEquationRegion, type EquationInfo } from '../utils/equation-extractor';
import { useFigureStore } from '../hooks/useFigureStore';
import { useEquationStore } from '../hooks/useEquationStore';
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
  onStartFigureRabbitHole: (question: string, imageDataUrl: string, figureNumber: string, pageNumber: number) => void;
  onStartEquationRabbitHole: (question: string, imageDataUrl: string, equationNumber: string, pageNumber: number, bounds: { left: number; top: number; width: number; height: number }) => void;
  savedRabbitHoles: SavedRabbitHole[];
  onDeleteRabbitHole: (rabbitHoleId: string) => void;
  onReopenRabbitHole: (rabbitHole: SavedRabbitHole) => void;
  activeRabbitHoles: RabbitHoleWindow[];
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  scrollToHighlightId?: string | null;
  onScrollComplete?: () => void;
  isEquationMode?: boolean;
  persistedEquations?: Array<{
    id: string;
    bounds: { left: number; top: number; width: number; height: number };
    pageNumber: number;
  }>;
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

// Wrapper component to properly handle document load via useEffect
function PdfHighlighterWrapper({
  pdfDocument,
  numPages,
  onDocumentLoad,
  highlights,
  onSelection,
  highlighterUtilsRef,
  zoomLevel,
  savedRabbitHoles,
  onReopenRabbitHole,
  figureStore,
  equationStore,
}: {
  pdfDocument: any;
  numPages: number | null;
  onDocumentLoad: (numPages: number) => void;
  highlights: AppHighlight[];
  onSelection: (selection: PdfSelection) => void;
  highlighterUtilsRef: React.MutableRefObject<PdfHighlighterUtils | undefined>;
  zoomLevel: number;
  savedRabbitHoles: SavedRabbitHole[];
  onReopenRabbitHole: (rabbitHole: SavedRabbitHole) => void;
  figureStore: ReturnType<typeof useFigureStore>;
  equationStore: ReturnType<typeof useEquationStore>;
}) {
  // Update numPages when document loads - using useEffect to avoid setState during render
  useEffect(() => {
    if (pdfDocument.numPages !== numPages) {
      onDocumentLoad(pdfDocument.numPages);
    }
  }, [pdfDocument.numPages, numPages, onDocumentLoad]);

  // Extract figures from all pages when document loads
  // Use a ref to track if extraction has been done for this document
  const extractedDocRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip if already extracted for this document
    const docId = pdfDocument.fingerprints?.[0] || String(pdfDocument.numPages);
    if (extractedDocRef.current === docId) return;

    async function extractAllFiguresAndEquations() {
      extractedDocRef.current = docId;
      figureStore.clear();
      equationStore.clear();

      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        try {
          const page = await pdfDocument.getPage(pageNum);

          // Extract figures
          const figures = await extractFiguresFromPage(page, pageNum);
          for (const figure of figures) {
            figureStore.addFigure(figure.figureNumber, figure);
            console.log(`Found figure ${figure.figureNumber} on page ${figure.pageNumber}: "${figure.captionText.substring(0, 50)}..."`);
          }

          // Extract equations
          const equations = await extractEquationsFromPage(page, pageNum);
          for (const equation of equations) {
            equationStore.addEquation(equation.equationNumber, equation);
            console.log(`Found equation ${equation.equationNumber} on page ${equation.pageNumber}: "${equation.labelText}"`);
          }
        } catch (error) {
          console.error(`Failed to extract from page ${pageNum}:`, error);
        }
      }

      // Mark extraction complete, but screenshots will be captured lazily
      figureStore.setReady(true);
      equationStore.setReady(true);
      console.log(`Extracted ${figureStore.figures.size} figures and ${equationStore.equations.size} equations from PDF`);
    }

    extractAllFiguresAndEquations();
  }, [pdfDocument, figureStore, equationStore]);

  return (
    <PdfHighlighter
      pdfDocument={pdfDocument}
      highlights={highlights}
      onSelection={onSelection}
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
}

export function PdfViewer({
  file,
  currentPage,
  numPages,
  onPageChange,
  onDocumentLoad,
  onStartRabbitHole,
  onStartFigureRabbitHole,
  onStartEquationRabbitHole,
  savedRabbitHoles,
  onDeleteRabbitHole,
  onReopenRabbitHole,
  activeRabbitHoles,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  scrollToHighlightId,
  onScrollComplete,
  isEquationMode = false,
  persistedEquations = [],
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

  // Figure click-to-preview state
  const figureStore = useFigureStore();
  const [hoveredFigure, setHoveredFigure] = useState<{
    figure: FigureInfo;
    position: { x: number; y: number };
  } | null>(null);

  // Equation click-to-preview state
  const equationStore = useEquationStore();
  const [hoveredEquation, setHoveredEquation] = useState<{
    equation: EquationInfo;
    position: { x: number; y: number };
  } | null>(null);

  // Equation annotation state (for drawing rectangles)
  const [equationAnnotations, setEquationAnnotations] = useState<EquationAnnotation[]>([]);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const annotationOverlayRef = useRef<HTMLDivElement | null>(null);
  const [viewerReady, setViewerReady] = useState(false);

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
    const getHighlightType = (position: ScaledPosition): AppHighlight['type'] => {
      return position.rects && position.rects.length > 0 ? 'text' : 'area';
    };

    // Add saved rabbit hole highlights (green)
    savedRabbitHoles.forEach(rabbitHole => {
      if (rabbitHole.highlightPosition) {
        result.push({
          id: `rabbithole-${rabbitHole.id}`,
          type: getHighlightType(rabbitHole.highlightPosition),
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
          type: getHighlightType(rh.highlightPosition),
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

  // Capture figure screenshot lazily when needed
  const captureFigureScreenshot = useCallback(async (figure: FigureInfo): Promise<string | null> => {
    const viewer = highlighterUtilsRef.current?.getViewer();
    if (!viewer) return null;

    try {
      const pageView = viewer.getPageView(figure.pageNumber - 1); // 0-indexed
      if (!pageView?.canvas || !pageView?.viewport) return null;

      const canvas = pageView.canvas;
      const viewport = pageView.viewport;
      const pageHeight = viewport.height / viewport.scale;

      const dataUrl = captureFigureRegion(
        canvas,
        figure.captionY,
        pageHeight,
        700, // Capture 700 units above caption for larger figures
        viewport.scale
      );

      return dataUrl || null;
    } catch (error) {
      console.error('Failed to capture figure screenshot:', error);
      return null;
    }
  }, []);

  // Capture equation screenshot lazily when needed
  const captureEquationScreenshot = useCallback(async (equation: EquationInfo): Promise<string | null> => {
    const viewer = highlighterUtilsRef.current?.getViewer();
    if (!viewer) return null;

    try {
      const pageView = viewer.getPageView(equation.pageNumber - 1); // 0-indexed
      if (!pageView?.canvas || !pageView?.viewport) return null;

      const canvas = pageView.canvas;
      const viewport = pageView.viewport;
      const pageHeight = viewport.height / viewport.scale;

      const dataUrl = captureEquationRegion(
        canvas,
        equation.equationY,
        pageHeight,
        200, // Capture 200px region around equation
        viewport.scale
      );

      return dataUrl || null;
    } catch (error) {
      console.error('Failed to capture equation screenshot:', error);
      return null;
    }
  }, []);

  // Highlight figure references in text layer and handle clicks
  useEffect(() => {
    const viewer = highlighterUtilsRef.current?.getViewer();
    if (!viewer || !figureStore.isReady) return;

    const container = viewer.container;

    // Pattern to match figure references
    const figurePattern = /\b(Figure|Fig\.?)\s*(\d+[a-z]?)\b/gi;

    // Process text layers to highlight figure references
    const processTextLayers = () => {
      const textLayers = container.querySelectorAll('.textLayer');

      textLayers.forEach((textLayer) => {
        // Skip if already processed
        if (textLayer.getAttribute('data-figures-processed')) return;
        textLayer.setAttribute('data-figures-processed', 'true');

        const spans = textLayer.querySelectorAll('span');
        spans.forEach((span) => {
          const text = span.textContent || '';
          if (!figurePattern.test(text)) return;

          // Reset pattern index
          figurePattern.lastIndex = 0;

          // Replace figure references with clickable spans
          const newHTML = text.replace(figurePattern, (match, prefix, num) => {
            const figureNumber = num;
            if (figureStore.hasFigure(figureNumber)) {
              return `<span class="figure-link" data-figure="${figureNumber}" style="background-color: #fef3c7; border-radius: 2px; padding: 0 2px; cursor: pointer;">${match}</span>`;
            }
            return match;
          });

          if (newHTML !== text) {
            span.innerHTML = newHTML;
          }
        });
      });
    };

    // Process initially and on scroll (new pages render)
    processTextLayers();

    // Use MutationObserver to detect new text layers
    const observer = new MutationObserver(() => {
      processTextLayers();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    // Handle clicks on figure links
    const handleClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (target.classList.contains('figure-link')) {
        e.preventDefault();
        e.stopPropagation();

        const figureNumber = target.getAttribute('data-figure');
        if (!figureNumber) return;

        const figure = figureStore.getFigure(figureNumber);
        if (!figure) return;

        // Capture screenshot if not already captured
        if (!figure.imageDataUrl) {
          const dataUrl = await captureFigureScreenshot(figure);
          if (dataUrl) {
            figure.imageDataUrl = dataUrl;
            figureStore.addFigure(figureNumber, figure);
          }
        }

        if (figure.imageDataUrl) {
          const rect = target.getBoundingClientRect();
          setHoveredFigure({
            figure,
            position: { x: rect.left + rect.width / 2, y: rect.top },
          });
        }
      }
    };

    // Close tooltip when clicking elsewhere
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.figure-tooltip') && !target.classList.contains('figure-link')) {
        setHoveredFigure(null);
      }
    };

    container.addEventListener('click', handleClick);
    document.addEventListener('click', handleClickOutside);

    return () => {
      observer.disconnect();
      container.removeEventListener('click', handleClick);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [figureStore, captureFigureScreenshot]);

  // Highlight equation references in text layer and handle clicks
  useEffect(() => {
    const viewer = highlighterUtilsRef.current?.getViewer();
    if (!viewer || !equationStore.isReady) return;

    const container = viewer.container;

    // Pattern to match equation references: "Equation 1", "Eq. 2a", "(1)"
    const equationPattern = /\b(Equation|Eq\.?)\s*(\d+[a-z]?)\b|\((\d+[a-z]?)\)/gi;

    // Process text layers to highlight equation references
    const processTextLayers = () => {
      const textLayers = container.querySelectorAll('.textLayer');

      textLayers.forEach((textLayer) => {
        // Skip if already processed
        if (textLayer.getAttribute('data-equations-processed')) return;
        textLayer.setAttribute('data-equations-processed', 'true');

        const spans = textLayer.querySelectorAll('span');
        spans.forEach((span) => {
          const text = span.textContent || '';
          if (!equationPattern.test(text)) return;

          // Reset pattern index
          equationPattern.lastIndex = 0;

          // Replace equation references with clickable spans
          const newHTML = text.replace(equationPattern, (match, prefix, num1, num2) => {
            const equationNumber = num1 || num2; // num1 for "Equation X", num2 for "(X)"
            if (equationStore.hasEquation(equationNumber)) {
              return `<span class="equation-link" data-equation="${equationNumber}" style="background-color: #dbeafe; border-radius: 2px; padding: 0 2px; cursor: pointer;">${match}</span>`;
            }
            return match;
          });

          if (newHTML !== text) {
            span.innerHTML = newHTML;
          }
        });
      });
    };

    // Process initially and on scroll (new pages render)
    processTextLayers();

    // Use MutationObserver to detect new text layers
    const observer = new MutationObserver(() => {
      processTextLayers();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    // Handle clicks on equation links
    const handleClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (target.classList.contains('equation-link')) {
        e.preventDefault();
        e.stopPropagation();

        const equationNumber = target.getAttribute('data-equation');
        if (!equationNumber) return;

        const equation = equationStore.getEquation(equationNumber);
        if (!equation) return;

        // Capture screenshot if not already captured
        if (!equation.imageDataUrl) {
          const dataUrl = await captureEquationScreenshot(equation);
          if (dataUrl) {
            equation.imageDataUrl = dataUrl;
            equationStore.addEquation(equationNumber, equation);
          }
        }

        if (equation.imageDataUrl) {
          const rect = target.getBoundingClientRect();
          setHoveredEquation({
            equation,
            position: { x: rect.left + rect.width / 2, y: rect.top },
          });
        }
      }
    };

    // Close tooltip when clicking elsewhere
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.equation-tooltip') && !target.classList.contains('equation-link')) {
        setHoveredEquation(null);
      }
    };

    container.addEventListener('click', handleClick);
    document.addEventListener('click', handleClickOutside);

    return () => {
      observer.disconnect();
      container.removeEventListener('click', handleClick);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [equationStore, captureEquationScreenshot]);

  // Mark viewer as ready when available
  useEffect(() => {
    const checkViewer = () => {
      const viewer = highlighterUtilsRef.current?.getViewer();
      if (viewer && !viewerReady) {
        console.log('Viewer is now ready');
        setViewerReady(true);
      }
    };

    // Check immediately
    checkViewer();

    // Check periodically until ready
    const interval = setInterval(checkViewer, 100);

    return () => clearInterval(interval);
  }, [viewerReady]);

  // Render equation annotations and persisted equations in the viewer overlay
  useEffect(() => {
    // Ensure overlay is created first
    const viewer = highlighterUtilsRef.current?.getViewer();
    if (!viewer) {
      console.log('Viewer not ready yet, skipping render');
      return;
    }

    if (!annotationOverlayRef.current) {
      console.log('Creating annotation overlay');
      const container = viewer.container;
      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '1000';
      overlay.className = 'equation-annotation-overlay';
      container.style.position = 'relative';
      container.appendChild(overlay);
      annotationOverlayRef.current = overlay;
      console.log('Overlay created and attached');
    }

    const overlay = annotationOverlayRef.current;

    console.log('Rendering annotations and persisted equations. Annotations:', equationAnnotations.length, 'Persisted:', persistedEquations.length);

    overlay.innerHTML = ''; // Clear previous content

    // Remove any existing input boxes from previous renders
    document.querySelectorAll('.equation-input-box').forEach(el => el.remove());

    // Render equation annotations (blue rectangles with input boxes)
    equationAnnotations.forEach(annotation => {
      console.log('Rendering annotation:', annotation.id, annotation.bounds);
      // Rectangle
      const rect = document.createElement('div');
      rect.style.position = 'absolute';
      rect.style.left = `${annotation.bounds.left}px`;
      rect.style.top = `${annotation.bounds.top}px`;
      rect.style.width = `${annotation.bounds.width}px`;
      rect.style.height = `${annotation.bounds.height}px`;
      rect.style.border = '3px solid #2563eb';
      rect.style.background = 'rgba(59, 130, 246, 0.3)';
      rect.style.pointerEvents = 'none';
      overlay.appendChild(rect);

      // Input box - append directly to body to escape pointer-events restriction
      const inputBox = document.createElement('div');
      inputBox.className = 'equation-input-box'; // For cleanup
      inputBox.setAttribute('data-annotation-id', annotation.id); // For tracking
      inputBox.style.position = 'fixed';

      // Calculate fixed position from absolute bounds
      const container = viewer.container;
      const containerRect = container.getBoundingClientRect();
      const fixedLeft = containerRect.left + annotation.bounds.left - container.scrollLeft;
      const fixedTop = containerRect.top + annotation.bounds.top + annotation.bounds.height + 8 - container.scrollTop;

      inputBox.style.left = `${fixedLeft}px`;
      inputBox.style.top = `${fixedTop}px`;
      inputBox.style.minWidth = `${Math.max(300, annotation.bounds.width)}px`;
      inputBox.style.background = 'white';
      inputBox.style.borderRadius = '8px';
      inputBox.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
      inputBox.style.border = '1px solid #bfdbfe';
      inputBox.style.padding = '8px';
      inputBox.style.display = 'flex';
      inputBox.style.gap = '8px';
      inputBox.style.alignItems = 'center';
      inputBox.style.pointerEvents = 'auto';
      inputBox.style.zIndex = '99999';

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'What do you want to know about this equation?';
      input.style.flex = '1';
      input.style.padding = '6px 12px';
      input.style.fontSize = '14px';
      input.style.border = '1px solid #e2e8f0';
      input.style.borderRadius = '6px';
      input.style.outline = 'none';
      input.addEventListener('focus', () => {
        input.style.borderColor = '#3b82f6';
        input.style.boxShadow = '0 0 0 1px #3b82f6';
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = '#e2e8f0';
        input.style.boxShadow = 'none';
      });

      const submitBtn = document.createElement('button');
      submitBtn.innerHTML = '✓';
      submitBtn.style.padding = '6px 12px';
      submitBtn.style.background = '#2563eb';
      submitBtn.style.color = 'white';
      submitBtn.style.border = 'none';
      submitBtn.style.borderRadius = '6px';
      submitBtn.style.cursor = 'pointer';
      submitBtn.style.fontSize = '16px';
      submitBtn.style.fontWeight = 'bold';
      submitBtn.addEventListener('click', () => {
        const question = input.value.trim();
        console.log('Submit clicked:', question, annotation.imageDataUrl ? 'has image' : 'no image');
        if (question && annotation.imageDataUrl) {
          console.log('Calling onStartEquationRabbitHole with bounds:', annotation.bounds);
          onStartEquationRabbitHole(question, annotation.imageDataUrl, annotation.id, annotation.pageNumber, annotation.bounds);
          setEquationAnnotations(prev => prev.filter(a => a.id !== annotation.id));
        } else {
          console.log('Submit blocked - missing question or image');
        }
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.innerHTML = '✕';
      cancelBtn.style.padding = '6px 10px';
      cancelBtn.style.background = '#f1f5f9';
      cancelBtn.style.color = '#64748b';
      cancelBtn.style.border = 'none';
      cancelBtn.style.borderRadius = '6px';
      cancelBtn.style.cursor = 'pointer';
      cancelBtn.style.fontSize = '16px';
      cancelBtn.addEventListener('click', () => {
        setEquationAnnotations(prev => prev.filter(a => a.id !== annotation.id));
      });

      inputBox.appendChild(input);
      inputBox.appendChild(submitBtn);
      inputBox.appendChild(cancelBtn);

      // Append to body instead of overlay
      document.body.appendChild(inputBox);

      // Auto-focus the input
      setTimeout(() => input.focus(), 0);

      // Enter to submit, Escape to cancel
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          submitBtn.click();
        } else if (e.key === 'Escape') {
          cancelBtn.click();
        }
      });
    });

    // Render persisted equations (green rectangles)
    console.log('Rendering persisted equations:', persistedEquations);

    persistedEquations.forEach(equation => {
      const rect = document.createElement('div');
      rect.style.position = 'absolute';
      rect.style.left = `${equation.bounds.left}px`;
      rect.style.top = `${equation.bounds.top}px`;
      rect.style.width = `${equation.bounds.width}px`;
      rect.style.height = `${equation.bounds.height}px`;
      rect.style.border = '2px solid #16a34a';
      rect.style.background = 'rgba(34, 197, 94, 0.2)';
      rect.style.pointerEvents = 'none';
      overlay.appendChild(rect);
    });
  }, [equationAnnotations, persistedEquations, onStartEquationRabbitHole, viewerReady]);

  // Equation annotation drawing handlers - using global mouse events for reliability
  useEffect(() => {
    if (!isEquationMode) return;

    const viewer = highlighterUtilsRef.current?.getViewer();
    if (!viewer) return;

    const container = viewer.container;
    let localDrawStart: { x: number; y: number; pageNum: number; pageEl: HTMLElement } | null = null;
    let localCurrentDraw: { x: number; y: number } | null = null;
    let localIsDrawing = false;

    // Create overlay div for drawing preview
    const drawOverlay = document.createElement('div');
    drawOverlay.style.position = 'absolute';
    drawOverlay.style.top = '0';
    drawOverlay.style.left = '0';
    drawOverlay.style.width = '100%';
    drawOverlay.style.height = '100%';
    drawOverlay.style.pointerEvents = 'none';
    drawOverlay.style.zIndex = '9999';
    container.style.position = 'relative';
    container.appendChild(drawOverlay);

    const handleMouseDown = (e: MouseEvent) => {
      // Only handle left mouse button and clicks inside container
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (!container.contains(target)) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft;
      const y = e.clientY - rect.top + container.scrollTop;

      // Determine which page was clicked
      const pages = container.querySelectorAll('.page');
      let clickedPageNum = currentPage;
      let clickedPageEl: HTMLElement | null = null;

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement;
        const pageRect = pageEl.getBoundingClientRect();
        const relY = e.clientY - pageRect.top;
        const relX = e.clientX - pageRect.left;

        if (relY >= 0 && relY <= pageRect.height && relX >= 0 && relX <= pageRect.width) {
          clickedPageNum = i + 1;
          clickedPageEl = pageEl;
          break;
        }
      }

      if (!clickedPageEl) return;

      localDrawStart = { x, y, pageNum: clickedPageNum, pageEl: clickedPageEl };
      localCurrentDraw = { x, y };
      localIsDrawing = true;

      e.preventDefault();
      e.stopPropagation();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!localIsDrawing || !localDrawStart) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft;
      const y = e.clientY - rect.top + container.scrollTop;

      localCurrentDraw = { x, y };

      // Draw preview rectangle
      const left = Math.min(localDrawStart.x, x);
      const top = Math.min(localDrawStart.y, y);
      const width = Math.abs(x - localDrawStart.x);
      const height = Math.abs(y - localDrawStart.y);

      drawOverlay.innerHTML = `<div style="position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; border: 3px solid #2563eb; background: rgba(59, 130, 246, 0.3); pointer-events: none;"></div>`;

      e.preventDefault();
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (!localIsDrawing || !localDrawStart || !localCurrentDraw) {
        localIsDrawing = false;
        localDrawStart = null;
        localCurrentDraw = null;
        drawOverlay.innerHTML = '';
        return;
      }

      const rect = container.getBoundingClientRect();
      const endX = e.clientX - rect.left + container.scrollLeft;
      const endY = e.clientY - rect.top + container.scrollTop;

      // Calculate bounds in container coordinates (with scroll)
      const left = Math.min(localDrawStart.x, endX);
      const top = Math.min(localDrawStart.y, endY);
      const width = Math.abs(endX - localDrawStart.x);
      const height = Math.abs(endY - localDrawStart.y);

      // Clear preview
      drawOverlay.innerHTML = '';

      // Minimum size check
      if (width < 20 || height < 20) {
        localIsDrawing = false;
        localDrawStart = null;
        localCurrentDraw = null;
        return;
      }

      // Capture the region from the canvas
      const pageView = viewer.getPageView(localDrawStart.pageNum - 1);
      if (!pageView?.canvas) {
        localIsDrawing = false;
        localDrawStart = null;
        localCurrentDraw = null;
        return;
      }

      const canvas = pageView.canvas;
      const pageRect = localDrawStart.pageEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Convert container coordinates (with scroll) to page-relative coordinates
      const pageLeft = pageRect.left - containerRect.left + container.scrollLeft;
      const pageTop = pageRect.top - containerRect.top + container.scrollTop;

      const relativeLeft = left - pageLeft;
      const relativeTop = top - pageTop;

      // Capture the region
      const tempCanvas = document.createElement('canvas');
      const scale = canvas.width / pageRect.width;
      tempCanvas.width = width * scale;
      tempCanvas.height = height * scale;

      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(
          canvas,
          relativeLeft * scale,
          relativeTop * scale,
          width * scale,
          height * scale,
          0,
          0,
          width * scale,
          height * scale
        );
      }

      const imageDataUrl = tempCanvas.toDataURL('image/png');

      // Create annotation with container-relative coordinates (with scroll)
      const annotation: EquationAnnotation = {
        id: Date.now().toString(),
        bounds: {
          left,
          top,
          width,
          height,
        },
        pageNumber: localDrawStart.pageNum,
        question: '',
        imageDataUrl,
      };

      console.log('Creating equation annotation:', annotation);
      setEquationAnnotations(prev => {
        const updated = [...prev, annotation];
        console.log('Updated equationAnnotations:', updated);
        return updated;
      });

      localIsDrawing = false;
      localDrawStart = null;
      localCurrentDraw = null;

      e.preventDefault();
    };

    // Attach to document for global capture
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (drawOverlay.parentNode) {
        drawOverlay.parentNode.removeChild(drawOverlay);
      }
    };
  }, [isEquationMode, currentPage]);

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
    <div
      className="h-full flex flex-col relative"
      onContextMenu={handleContextMenu}
      style={{ cursor: isEquationMode ? 'crosshair' : 'default' }}
      ref={viewerContainerRef}
    >
      <PdfLoader document={file} workerSrc={PDFJS_WORKER_SRC}>
        {(pdfDocument) => (
          <PdfHighlighterWrapper
            pdfDocument={pdfDocument}
            numPages={numPages}
            onDocumentLoad={onDocumentLoad}
            highlights={highlights}
            onSelection={handleSelection}
            highlighterUtilsRef={highlighterUtilsRef}
            zoomLevel={zoomLevel}
            savedRabbitHoles={savedRabbitHoles}
            onReopenRabbitHole={onReopenRabbitHole}
            figureStore={figureStore}
            equationStore={equationStore}
          />
        )}
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

      {/* Figure click tooltip */}
      {hoveredFigure && hoveredFigure.figure.imageDataUrl && (
        <div className="figure-tooltip" style={{ zIndex: 99999 }}>
          <FigureTooltip
            imageDataUrl={hoveredFigure.figure.imageDataUrl}
            caption={hoveredFigure.figure.captionText}
            figureNumber={hoveredFigure.figure.figureNumber}
            pageNumber={hoveredFigure.figure.pageNumber}
            position={hoveredFigure.position}
            onClose={() => setHoveredFigure(null)}
            onAskAboutFigure={onStartFigureRabbitHole}
          />
        </div>
      )}

      {/* Equation click tooltip */}
      {hoveredEquation && hoveredEquation.equation.imageDataUrl && (
        <div className="equation-tooltip" style={{ zIndex: 99999 }}>
          <EquationTooltip
            imageDataUrl={hoveredEquation.equation.imageDataUrl}
            label={hoveredEquation.equation.labelText}
            equationNumber={hoveredEquation.equation.equationNumber}
            pageNumber={hoveredEquation.equation.pageNumber}
            position={hoveredEquation.position}
            onClose={() => setHoveredEquation(null)}
            onAskAboutEquation={onStartEquationRabbitHole}
          />
        </div>
      )}
    </div>
  );
}
