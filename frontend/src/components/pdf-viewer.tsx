import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import {
  PdfLoader,
  PdfHighlighter,
  TextHighlight,
  AreaHighlight,
  useHighlightContainerContext,
} from 'react-pdf-highlighter-extended';
import type { Highlight, PdfSelection, ScaledPosition, PdfHighlighterUtils, PDFDocumentProxy } from 'react-pdf-highlighter-extended';
import { FileQuestion, Rabbit } from 'lucide-react';
import { SavedRabbitHole, RabbitHoleWindow } from '../App';
import { HighlightMarkers } from './highlight-markers';
import { ContextMenu } from './context-menu';
import { FigureTooltip } from './figure-tooltip';
import { CitationContextMenu } from './reference-tracer';
import { extractFiguresFromPage, captureFigureRegion, parseFigureReference, type FigureInfo } from '../utils/figure-extractor';
import { containsCitation, extractReferenceKey, inferCitationType, type CitationMatch } from '../utils/reference-detector';
import { extractBibliography, type BibliographyEntry } from '../utils/bibliography-parser';
import { summarizeReference, type ReferenceSummary } from '../api/chat';
import { useFigureStore } from '../hooks/useFigureStore';
import 'react-pdf-highlighter-extended/dist/esm/style/PdfHighlighter.css';
import 'react-pdf-highlighter-extended/dist/esm/style/TextHighlight.css';
import 'react-pdf-highlighter-extended/dist/esm/style/AreaHighlight.css';
import 'react-pdf-highlighter-extended/dist/esm/style/MouseSelection.css';

// Fix version mismatch: worker version must match the bundled pdfjs-dist version
const PDFJS_WORKER_SRC = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

export interface ReferenceRabbitHoleInfo {
  citationKey: string;                // "[1]" or "(Smith, 2020)"
  referenceTitle: string;
  referenceAuthors: string;
  referenceYear?: number;
  paragraphContext: string;           // Context for the AI prompt
  rawBibText: string;
  pageNumber: number;
}

interface PdfViewerProps {
  file: string | null;
  currentPage: number;
  numPages: number | null;
  onPageChange: (page: number) => void;
  onDocumentLoad: (numPages: number) => void;
  onStartRabbitHole: (selectedText: string, pageReference: number, parentId?: string, highlightPosition?: ScaledPosition) => void;
  onStartFigureRabbitHole: (question: string, imageDataUrl: string, figureNumber: string, pageNumber: number) => void;
  onStartReferenceRabbitHole?: (info: ReferenceRabbitHoleInfo) => void;
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
  onBibliographyExtracted,
}: {
  pdfDocument: PDFDocumentProxy;
  numPages: number | null;
  onDocumentLoad: (numPages: number) => void;
  highlights: AppHighlight[];
  onSelection: (selection: PdfSelection) => void;
  highlighterUtilsRef: React.MutableRefObject<PdfHighlighterUtils | undefined>;
  zoomLevel: number;
  savedRabbitHoles: SavedRabbitHole[];
  onReopenRabbitHole: (rabbitHole: SavedRabbitHole) => void;
  figureStore: ReturnType<typeof useFigureStore>;
  onBibliographyExtracted: (bibliography: Map<string, BibliographyEntry>) => void;
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

    async function extractAllFigures() {
      extractedDocRef.current = docId;
      figureStore.clear();

      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        try {
          const page = await pdfDocument.getPage(pageNum);
          const figures = await extractFiguresFromPage(page, pageNum);

          for (const figure of figures) {
            figureStore.addFigure(figure.figureNumber, figure);
          }
        } catch (error) {
          console.error(`Failed to extract figures from page ${pageNum}:`, error);
        }
      }

      // Mark extraction complete, but screenshots will be captured lazily
      figureStore.setReady(true);
    }

    async function extractBib() {
      if (!onBibliographyExtracted) return;
      try {
        const bibliography = await extractBibliography(pdfDocument);
        onBibliographyExtracted(bibliography);
      } catch (error) {
        console.error('Failed to extract bibliography:', error);
      }
    }

    extractAllFigures();
    extractBib();
  }, [pdfDocument, onBibliographyExtracted]);

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
  onStartReferenceRabbitHole,
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

  // Figure click-to-preview state
  const figureStore = useFigureStore();
  const [hoveredFigure, setHoveredFigure] = useState<{
    figure: FigureInfo;
    position: { x: number; y: number };
  } | null>(null);

  // Reference/citation detection state
  const [bibliography, setBibliography] = useState<Map<string, BibliographyEntry>>(new Map());
  const [citationContextMenu, setCitationContextMenu] = useState<{
    citation: CitationMatch;
    bibliographyEntry?: BibliographyEntry;
    paragraphContext: string;
    position: { x: number; y: number };
  } | null>(null);

  // Citation hover tooltip state
  const [hoveredCitation, setHoveredCitation] = useState<{
    citationKey: string;
    bibliographyEntry?: BibliographyEntry;
    position: { x: number; y: number };
    linkElement: HTMLAnchorElement;
    isLoading?: boolean;
    summary?: ReferenceSummary;
  } | null>(null);
  const isHoveringTooltipRef = useRef(false);

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

  // Handle citation right-click for reference rabbit holes
  useEffect(() => {
    const viewer = highlighterUtilsRef.current?.getViewer();
    if (!viewer) return;

    const container = viewer.container;

    // Citation patterns to detect - global flag for searching in longer text
    const CITATION_PATTERN = /\[(\d+(?:\s*[-,]\s*\d+)*)\]/g;  // [1], [1,2], [1-3]

    const handleCitationContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Helper function to find citation at a position
      const findCitationAtPosition = (x: number, y: number, page: Element): CitationMatch | null => {
        const textLayer = page.querySelector('.textLayer');
        if (!textLayer) return null;

        const spans = Array.from(textLayer.querySelectorAll('span'));

        // Find spans near the click position (within 20px)
        const nearbySpans = spans.filter(span => {
          const spanRect = span.getBoundingClientRect();
          return x >= spanRect.left - 20 && x <= spanRect.right + 20 &&
                 y >= spanRect.top - 10 && y <= spanRect.bottom + 10;
        });

        // Also check spans on the same line
        const clickY = y;
        const lineSpans = spans.filter(span => {
          const spanRect = span.getBoundingClientRect();
          return Math.abs(spanRect.top + spanRect.height / 2 - clickY) < 15;
        });

        const allRelevantSpans = [...new Set([...nearbySpans, ...lineSpans])];
        const text = allRelevantSpans.map(s => s.textContent).join('');

        CITATION_PATTERN.lastIndex = 0;
        const match = text.match(CITATION_PATTERN);
        if (match) {
          return {
            text: match[0],
            referenceKey: extractReferenceKey(match[0]),
            type: inferCitationType(match[0]),
            position: nearbySpans[0]?.getBoundingClientRect() || { x, y, width: 20, height: 20 },
            pageNumber: currentPage,
          } as CitationMatch;
        }
        return null;
      };

      // Check if clicking on an internal link (annotation layer) - these are citation links
      const internalLink = target.closest('a.internalLink, a[data-element-id], section.linkAnnotation a, .annotationLayer a, a[href^="#"]');
      const page = target.closest('.page');

      if (internalLink && page) {
        const rect = internalLink.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const citation = findCitationAtPosition(centerX, centerY, page);
        if (citation) {
          e.preventDefault();
          e.stopPropagation();

          const bibliographyEntry = bibliography.get(citation.referenceKey);

          // Get paragraph context
          const textLayer = page.querySelector('.textLayer');
          let paragraphContext = citation.text;
          if (textLayer) {
            const spans = Array.from(textLayer.querySelectorAll('span'));
            const nearbySpans = spans.filter(span => {
              const spanRect = span.getBoundingClientRect();
              return Math.abs(spanRect.top - rect.top) < 50;
            });
            paragraphContext = nearbySpans.map(s => s.textContent).join(' ').trim().slice(0, 500);
          }

          setCitationContextMenu({
            citation,
            bibliographyEntry,
            paragraphContext,
            position: { x: e.clientX, y: e.clientY },
          });

          setContextMenu(null);
          return;
        }
      }

      // Fallback: try to find citation at click position even without a link
      if (page) {
        const citation = findCitationAtPosition(e.clientX, e.clientY, page);
        if (citation) {
          e.preventDefault();
          e.stopPropagation();

          const bibliographyEntry = bibliography.get(citation.referenceKey);

          const textLayer = page.querySelector('.textLayer');
          let paragraphContext = citation.text;
          if (textLayer) {
            const spans = Array.from(textLayer.querySelectorAll('span'));
            const nearbySpans = spans.filter(span => {
              const spanRect = span.getBoundingClientRect();
              return Math.abs(spanRect.top - e.clientY) < 50;
            });
            paragraphContext = nearbySpans.map(s => s.textContent).join(' ').trim().slice(0, 500);
          }

          setCitationContextMenu({
            citation,
            bibliographyEntry,
            paragraphContext,
            position: { x: e.clientX, y: e.clientY },
          });

          setContextMenu(null);
          return;
        }
      }

      // Fallback: check text layer for citations
      const textLayer = target.closest('.textLayer');
      if (!textLayer) return;

      // Get text from clicked span and nearby spans to catch citations in context
      const spans = Array.from(textLayer.querySelectorAll('span'));
      const clickedIndex = spans.indexOf(target);
      if (clickedIndex === -1) return;

      // Look at clicked span and immediate neighbors (citations might span elements)
      const startIdx = Math.max(0, clickedIndex - 2);
      const endIdx = Math.min(spans.length - 1, clickedIndex + 2);
      const nearbyText = spans.slice(startIdx, endIdx + 1)
        .map(s => s.textContent)
        .join('');

      // Find all citations in nearby text
      CITATION_PATTERN.lastIndex = 0;
      const matches: { text: string; index: number }[] = [];
      let match;
      while ((match = CITATION_PATTERN.exec(nearbyText)) !== null) {
        matches.push({ text: match[0], index: match.index });
      }

      if (matches.length === 0) return;

      // Find the citation closest to the click position within the nearby text
      // Use the first match if we found any in the vicinity
      const citationText = matches[0].text;

      e.preventDefault();
      e.stopPropagation();

      // Get paragraph context (wider surrounding text)
      const contextStartIdx = Math.max(0, clickedIndex - 15);
      const contextEndIdx = Math.min(spans.length - 1, clickedIndex + 15);
      const paragraphContext = spans.slice(contextStartIdx, contextEndIdx + 1)
        .map(s => s.textContent)
        .join(' ')
        .trim()
        .slice(0, 500);

      const referenceKey = extractReferenceKey(citationText);
      const bibliographyEntry = bibliography.get(referenceKey);

      const citation: CitationMatch = {
        text: citationText,
        referenceKey,
        type: inferCitationType(citationText),
        position: target.getBoundingClientRect(),
        pageNumber: currentPage,
      };

      setCitationContextMenu({
        citation,
        bibliographyEntry,
        paragraphContext,
        position: { x: e.clientX, y: e.clientY },
      });

      // Clear text selection context menu
      setContextMenu(null);
    };

    // Close citation context menu on click elsewhere
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.citation-context-menu')) {
        setCitationContextMenu(null);
      }
    };

    // Use document-level capture to intercept before browser's default link context menu
    document.addEventListener('contextmenu', handleCitationContextMenu, true);
    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('contextmenu', handleCitationContextMenu, true);
      document.removeEventListener('click', handleClick);
    };
  }, [bibliography, currentPage]);

  // Handle citation link hover - detect links with #cite or #ref in href
  useEffect(() => {
    const viewer = highlighterUtilsRef.current?.getViewer();
    if (!viewer) return;

    const container = viewer.container;
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a') as HTMLAnchorElement | null;

      if (!link) return;

      const href = link.getAttribute('href') || '';

      // Check if this is a citation link (contains #cite, #ref, or #bib)
      const citationMatch = href.match(/#(?:cite|ref|bib)[._-]?(\w+)/i) ||
                           href.match(/#(\d+)$/) ||
                           href.match(/#([A-Za-z]+\d{4}\w*)/);  // Author2020keyword style

      if (citationMatch) {
        // Clear any pending timeout
        if (hoverTimeout) clearTimeout(hoverTimeout);

        // Small delay to avoid flickering
        hoverTimeout = setTimeout(async () => {
          const citationKey = citationMatch[1];
          const rect = link.getBoundingClientRect();

          // Try to find in bibliography
          let bibliographyEntry = bibliography.get(citationKey);

          if (!bibliographyEntry) {
            // Try numeric key
            const numKey = citationKey.replace(/\D/g, '');
            if (numKey) {
              bibliographyEntry = bibliography.get(numKey);
            }
          }

          if (!bibliographyEntry) {
            // Try to find by author name match
            const authorMatch = citationKey.match(/^([a-z]+)(\d{4})/i);
            if (authorMatch) {
              const authorName = authorMatch[1].toLowerCase();
              const year = parseInt(authorMatch[2]);
              for (const [, entry] of bibliography) {
                const entryText = (entry.rawText || '').toLowerCase();
                const hasAuthor = entryText.includes(authorName) ||
                                  entry.authors?.some(a => a.toLowerCase().includes(authorName));
                const hasYear = entry.year === year || entryText.includes(String(year));
                if (hasAuthor && hasYear) {
                  bibliographyEntry = entry;
                  break;
                }
              }
            }
          }

          // Show tooltip immediately with loading state
          setHoveredCitation({
            citationKey,
            bibliographyEntry,
            position: { x: rect.left + rect.width / 2, y: rect.top },
            linkElement: link,
            isLoading: true,
          });

          // Get reference text to send to Gemini
          const referenceText = bibliographyEntry?.rawText || citationKey;

          // Call Gemini Flash to get summary
          try {
            const summary = await summarizeReference(referenceText, citationKey);
            // Update tooltip with summary (only if still hovering same citation)
            setHoveredCitation(prev => {
              if (prev?.citationKey === citationKey) {
                return { ...prev, isLoading: false, summary };
              }
              return prev;
            });
          } catch (error) {
            console.error('Failed to get reference summary:', error);
            setHoveredCitation(prev => {
              if (prev?.citationKey === citationKey) {
                return { ...prev, isLoading: false };
              }
              return prev;
            });
          }
        }, 150);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const relatedTarget = e.relatedTarget as HTMLElement | null;

      // Don't close if moving to the tooltip
      if (relatedTarget?.closest('.citation-hover-tooltip')) return;

      const link = target.closest('a');
      if (link) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        // Small delay before closing to allow moving to tooltip
        hoverTimeout = setTimeout(() => {
          // Check if we're now hovering over the tooltip
          if (!isHoveringTooltipRef.current) {
            setHoveredCitation(null);
          }
        }, 300);
      }
    };

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);

    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
      if (hoverTimeout) clearTimeout(hoverTimeout);
    };
  }, [bibliography, numPages]);

  // Handle starting a reference rabbit hole from hover tooltip
  const handleStartReferenceRabbitHoleFromHover = useCallback(() => {
    if (!hoveredCitation || !onStartReferenceRabbitHole) return;

    const { citationKey, bibliographyEntry, linkElement } = hoveredCitation;

    // Get paragraph context from surrounding text
    const page = linkElement.closest('.page');
    let paragraphContext = '';
    if (page) {
      const textLayer = page.querySelector('.textLayer');
      if (textLayer) {
        const rect = linkElement.getBoundingClientRect();
        const spans = Array.from(textLayer.querySelectorAll('span'));
        const nearbySpans = spans.filter(span => {
          const spanRect = span.getBoundingClientRect();
          return Math.abs(spanRect.top - rect.top) < 50;
        });
        paragraphContext = nearbySpans.map(s => s.textContent).join(' ').trim().slice(0, 500);
      }
    }

    onStartReferenceRabbitHole({
      citationKey: `[${citationKey}]`,
      referenceTitle: bibliographyEntry?.title || bibliographyEntry?.rawText?.slice(0, 100) || 'Unknown Reference',
      referenceAuthors: bibliographyEntry?.authors?.join(', ') || 'Unknown Authors',
      referenceYear: bibliographyEntry?.year,
      paragraphContext,
      rawBibText: bibliographyEntry?.rawText || '',
      pageNumber: currentPage,
    });

    setHoveredCitation(null);
  }, [hoveredCitation, currentPage, onStartReferenceRabbitHole]);

  // Handle starting a reference rabbit hole from context menu
  const handleStartReferenceRabbitHole = useCallback(() => {
    if (!citationContextMenu || !onStartReferenceRabbitHole) return;

    const { citation, bibliographyEntry, paragraphContext } = citationContextMenu;

    onStartReferenceRabbitHole({
      citationKey: citation.text,
      referenceTitle: bibliographyEntry?.title || bibliographyEntry?.rawText.slice(0, 100) || 'Unknown Reference',
      referenceAuthors: bibliographyEntry?.authors?.join(', ') || 'Unknown Authors',
      referenceYear: bibliographyEntry?.year,
      paragraphContext,
      rawBibText: bibliographyEntry?.rawText || '',
      pageNumber: currentPage,
    });

    setCitationContextMenu(null);
  }, [citationContextMenu, currentPage, onStartReferenceRabbitHole]);

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
            onBibliographyExtracted={setBibliography}
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

      {/* Citation right-click context menu */}
      {citationContextMenu && (
        <div className="citation-context-menu" style={{ zIndex: 100000 }}>
          <CitationContextMenu
            citation={citationContextMenu.citation}
            bibliographyEntry={citationContextMenu.bibliographyEntry}
            position={citationContextMenu.position}
            onStartRabbitHole={handleStartReferenceRabbitHole}
            onClose={() => setCitationContextMenu(null)}
          />
        </div>
      )}

      {/* Citation hover tooltip */}
      {hoveredCitation && (
        <div
          className="citation-hover-tooltip fixed bg-white rounded-lg shadow-xl border border-slate-200 p-3 max-w-sm"
          style={{
            left: Math.min(hoveredCitation.position.x, window.innerWidth - 350),
            top: hoveredCitation.position.y - 10,
            transform: 'translateY(-100%)',
            zIndex: 100001,
          }}
          onMouseEnter={() => {
            // Keep tooltip open when hovering over it
            isHoveringTooltipRef.current = true;
          }}
          onMouseLeave={() => {
            isHoveringTooltipRef.current = false;
            setHoveredCitation(null);
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
              [{hoveredCitation.citationKey}]
            </span>
            {hoveredCitation.isLoading && (
              <span className="text-xs text-slate-400 animate-pulse">Loading...</span>
            )}
          </div>

          {hoveredCitation.summary ? (
            <>
              <p className="text-sm font-medium text-slate-800 line-clamp-2 mb-1">
                {hoveredCitation.summary.title}
              </p>
              <p className="text-xs text-slate-500 mb-2">
                {hoveredCitation.summary.authors}
                {hoveredCitation.summary.year && ` (${hoveredCitation.summary.year})`}
              </p>
              <p className="text-xs text-slate-600 mb-3 line-clamp-3">
                {hoveredCitation.summary.summary}
              </p>
            </>
          ) : hoveredCitation.bibliographyEntry ? (
            <>
              <p className="text-sm font-medium text-slate-800 line-clamp-2 mb-1">
                {hoveredCitation.bibliographyEntry.title || hoveredCitation.bibliographyEntry.rawText?.slice(0, 100)}
              </p>
              {hoveredCitation.bibliographyEntry.authors && hoveredCitation.bibliographyEntry.authors.length > 0 && (
                <p className="text-xs text-slate-500 mb-2">
                  {hoveredCitation.bibliographyEntry.authors.length > 2
                    ? `${hoveredCitation.bibliographyEntry.authors[0]} et al.`
                    : hoveredCitation.bibliographyEntry.authors.join(', ')}
                  {hoveredCitation.bibliographyEntry.year && ` (${hoveredCitation.bibliographyEntry.year})`}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400 italic mb-2">
              {hoveredCitation.isLoading ? 'Fetching reference info...' : 'Reference info not found'}
            </p>
          )}

          <button
            onClick={handleStartReferenceRabbitHoleFromHover}
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: '#9333ea',
              color: 'white',
              fontSize: '14px',
              fontWeight: 500,
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <Rabbit style={{ width: 16, height: 16 }} />
            Start Rabbit Hole
          </button>
        </div>
      )}
    </div>
  );
}
