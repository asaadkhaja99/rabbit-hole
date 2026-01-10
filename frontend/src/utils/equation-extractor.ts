import type { PDFPageProxy } from 'pdfjs-dist';

export interface EquationInfo {
  equationNumber: string;      // "1", "2a", etc.
  pageNumber: number;
  labelText: string;           // Full label/context text
  equationY: number;           // Y position of equation in PDF coordinates
  imageDataUrl?: string;       // Captured screenshot
}

// Regex patterns for equation labels/references
// Matches: "Equation 1:", "Eq. 2a:", "(1)", etc.
const EQUATION_LABEL_PATTERNS = [
  /^Equation\s+(\d+[a-z]?)[\s\.:]/i,
  /^Eq\.\s*(\d+[a-z]?)[\s\.:]/i,
  /^\((\d+[a-z]?)\)\s*$/,  // Numbered equations like "(1)"
];

/**
 * Extract equation label information from a PDF page
 * Returns array of EquationInfo objects for each equation found
 */
export async function extractEquationsFromPage(
  pdfPage: PDFPageProxy,
  pageNumber: number
): Promise<EquationInfo[]> {
  const textContent = await pdfPage.getTextContent();
  const equations: EquationInfo[] = [];

  // Concatenate text items to find equation labels that span multiple items
  let currentText = '';
  let currentY = 0;

  for (const item of textContent.items) {
    if ('str' in item && item.str) {
      // Get Y position from transform matrix
      // transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const y = item.transform[5];

      // If Y position changed significantly, process accumulated text
      if (Math.abs(y - currentY) > 5 && currentText) {
        const equationMatch = matchEquationLabel(currentText);
        if (equationMatch) {
          equations.push({
            equationNumber: equationMatch.number,
            pageNumber,
            labelText: currentText.trim(),
            equationY: currentY,
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
    const equationMatch = matchEquationLabel(currentText);
    if (equationMatch) {
      equations.push({
        equationNumber: equationMatch.number,
        pageNumber,
        labelText: currentText.trim(),
        equationY: currentY,
      });
    }
  }

  return equations;
}

/**
 * Match text against equation label patterns
 */
function matchEquationLabel(text: string): { number: string } | null {
  const trimmedText = text.trim();

  for (const pattern of EQUATION_LABEL_PATTERNS) {
    const match = trimmedText.match(pattern);
    if (match) {
      return { number: match[1] };
    }
  }

  return null;
}

/**
 * Capture a region of the PDF page canvas containing an equation
 * Strategy: Capture a region centered around the equation label
 * @param canvas - The rendered PDF page canvas
 * @param equationY - Y position of equation label in PDF coordinates (Y=0 at bottom, unscaled)
 * @param pageHeight - Unscaled page height (viewport.height / viewport.scale)
 * @param captureHeight - Height of region to capture (default 200px)
 * @param _scale - Current zoom scale (unused, kept for API compatibility)
 */
export function captureEquationRegion(
  canvas: HTMLCanvasElement,
  equationY: number,
  pageHeight: number,
  captureHeight: number = 200,
  _scale: number = 1
): string {
  // Calculate effective scale from actual canvas dimensions
  // This accounts for device pixel ratio automatically
  const effectiveScale = canvas.height / pageHeight;

  // Convert PDF coordinates (Y=0 at bottom) to canvas coordinates (Y=0 at top)
  const canvasEquationY = (pageHeight - equationY) * effectiveScale;

  // Capture a region centered around the equation
  // Add margin above and below
  const margin = 50 * effectiveScale;
  const scaledCaptureHeight = captureHeight * effectiveScale;

  const captureTop = Math.max(0, canvasEquationY - margin);
  const captureBottom = Math.min(canvas.height, canvasEquationY + scaledCaptureHeight);
  const actualCaptureHeight = captureBottom - captureTop;

  // Create temp canvas and copy region
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = actualCaptureHeight;

  const ctx = tempCanvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(
    canvas,
    0, captureTop,                           // Source x, y
    canvas.width, actualCaptureHeight,       // Source width, height
    0, 0,                                    // Dest x, y
    canvas.width, actualCaptureHeight        // Dest width, height
  );

  return tempCanvas.toDataURL('image/png');
}

/**
 * Extract equation number from a reference like "Equation 1" or "Eq. 2a" or "(1)"
 */
export function parseEquationReference(text: string): string | null {
  const patterns = [
    /(?:equation|eq\.?)\s*(\d+[a-z]?)/i,
    /\((\d+[a-z]?)\)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  return null;
}
