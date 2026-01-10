import type { PDFPageProxy } from 'pdfjs-dist';

export interface FigureInfo {
  figureNumber: string;        // "1", "2a", etc.
  pageNumber: number;
  captionText: string;
  captionY: number;            // Y position of caption in PDF coordinates
  imageDataUrl?: string;       // Captured screenshot
}

// Regex patterns for figure captions
const FIGURE_CAPTION_PATTERNS = [
  /^Figure\s+(\d+[a-z]?)[\s\.:]/i,
  /^Fig\.\s*(\d+[a-z]?)[\s\.:]/i,
  /^FIGURE\s+(\d+[a-z]?)[\s\.:]/i,
];

/**
 * Extract figure caption information from a PDF page
 * Returns array of FigureInfo objects for each figure found
 */
export async function extractFiguresFromPage(
  pdfPage: PDFPageProxy,
  pageNumber: number
): Promise<FigureInfo[]> {
  const textContent = await pdfPage.getTextContent();
  const figures: FigureInfo[] = [];

  // Concatenate text items to find figure captions that span multiple items
  let currentText = '';
  let currentY = 0;

  for (const item of textContent.items) {
    if ('str' in item && item.str) {
      // Get Y position from transform matrix
      // transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const y = item.transform[5];

      // If Y position changed significantly, process accumulated text
      if (Math.abs(y - currentY) > 5 && currentText) {
        const figureMatch = matchFigureCaption(currentText);
        if (figureMatch) {
          console.log('Found figure caption:', {
            figureNumber: figureMatch.number,
            captionText: currentText.trim(),
            captionY: currentY,
          });
          figures.push({
            figureNumber: figureMatch.number,
            pageNumber,
            captionText: currentText.trim(),
            captionY: currentY,
          });
        }
        currentText = '';
      }

      currentText += item.str;
      currentY = y;
    }
  }

  // Check last accumulated text
  if (currentText) {
    const figureMatch = matchFigureCaption(currentText);
    if (figureMatch) {
      figures.push({
        figureNumber: figureMatch.number,
        pageNumber,
        captionText: currentText.trim(),
        captionY: currentY,
      });
    }
  }

  return figures;
}

/**
 * Match text against figure caption patterns
 */
function matchFigureCaption(text: string): { number: string } | null {
  const trimmedText = text.trim();

  for (const pattern of FIGURE_CAPTION_PATTERNS) {
    const match = trimmedText.match(pattern);
    if (match) {
      return { number: match[1] };
    }
  }

  return null;
}

/**
 * Capture a region of the PDF page canvas as a data URL
 * Strategy: Capture from top of page down to the caption
 * @param canvas - The rendered PDF page canvas
 * @param captionY - Y position of caption in PDF coordinates (Y=0 at bottom, unscaled)
 * @param pageHeight - Unscaled page height (viewport.height / viewport.scale)
 * @param _minHeight - Unused, kept for API compatibility
 * @param scale - Current zoom scale
 */
export function captureFigureRegion(
  canvas: HTMLCanvasElement,
  captionY: number,
  pageHeight: number,
  _minHeight: number = 250,
  _scale: number = 1
): string {
  // Calculate effective scale from actual canvas dimensions
  // This accounts for device pixel ratio automatically
  const effectiveScale = canvas.height / pageHeight;

  // Convert PDF coordinates (Y=0 at bottom) to canvas coordinates (Y=0 at top)
  // Distance from top in canvas pixels = (pageHeight - captionY) * effectiveScale
  const canvasCaptionY = (pageHeight - captionY) * effectiveScale;

  console.log('captureFigureRegion:', {
    captionY,
    pageHeight,
    effectiveScale,
    canvasHeight: canvas.height,
    canvasCaptionY,
  });

  // Capture from top of canvas down to just below the caption (add small margin)
  const captureHeight = Math.min(Math.max(canvasCaptionY + 40, 100), canvas.height);

  console.log('Final captureHeight:', captureHeight);

  // Create temp canvas and copy region
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = captureHeight;

  const ctx = tempCanvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(
    canvas,
    0, 0,                           // Source x, y (from top of page)
    canvas.width, captureHeight,    // Source width, height
    0, 0,                           // Dest x, y
    canvas.width, captureHeight     // Dest width, height
  );

  return tempCanvas.toDataURL('image/png');
}

/**
 * Extract figure number from a reference like "Figure 1" or "Fig. 2a"
 */
export function parseFigureReference(text: string): string | null {
  const match = text.match(/(?:figure|fig\.?)\s*(\d+[a-z]?)/i);
  return match ? match[1] : null;
}
