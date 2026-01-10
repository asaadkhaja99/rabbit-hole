import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';

// Citation patterns to detect
const CITATION_PATTERNS = [
  // Numbered: [1], [1,2], [1-3], [1, 2, 3]
  /\[(\d+(?:\s*[-,]\s*\d+)*)\]/g,

  // Author-year: (Smith, 2020), (Smith et al., 2020), (Smith & Jones, 2020)
  /\(([A-Z][a-z]+(?:\s+(?:et\s+al\.|&\s+[A-Z][a-z]+))?(?:,?\s*\d{4}))\)/g,

  // Superscript numbers: ¹, ², ³ (detected from text content)
  /[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g,
];

export interface CitationMatch {
  text: string;           // e.g., "[1]" or "(Smith, 2020)"
  referenceKey: string;   // Normalized key: "1" or "Smith2020"
  type: 'numbered' | 'author-year' | 'superscript';
  position: { x: number; y: number; width: number; height: number };
  pageNumber: number;
}

export function detectCitationsInText(
  textContent: TextContent,
  pageNumber: number
): CitationMatch[] {
  const matches: CitationMatch[] = [];

  for (const item of textContent.items) {
    if ('str' in item && 'transform' in item) {
      const textItem = item as TextItem;
      for (const pattern of CITATION_PATTERNS) {
        // Reset regex state for each item
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(textItem.str)) !== null) {
          // Calculate position within the text item
          const charWidth = textItem.width / textItem.str.length;
          const x = textItem.transform[4] + (match.index * charWidth);
          const y = textItem.transform[5];
          const width = match[0].length * charWidth;
          const height = textItem.height;

          matches.push({
            text: match[0],
            referenceKey: extractReferenceKey(match[0]),
            type: inferCitationType(match[0]),
            position: { x, y, width, height },
            pageNumber,
          });
        }
      }
    }
  }

  return matches;
}

export function extractReferenceKey(citation: string): string {
  // "[1]" -> "1", "[1, 2]" -> "1" (first one), "(Smith, 2020)" -> "Smith2020"
  const numbered = citation.match(/\d+/);
  if (numbered) return numbered[0];

  const authorYear = citation.match(/([A-Z][a-z]+).*?(\d{4})/);
  if (authorYear) return `${authorYear[1]}${authorYear[2]}`;

  // Superscript numbers
  const superscriptMap: Record<string, string> = {
    '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5',
    '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁰': '0',
  };
  const superscriptNum = citation.split('').map(c => superscriptMap[c] || c).join('');
  if (/^\d+$/.test(superscriptNum)) return superscriptNum;

  return citation;
}

export function inferCitationType(citation: string): CitationMatch['type'] {
  if (/^\[\d/.test(citation)) return 'numbered';
  if (/^\([A-Z]/.test(citation)) return 'author-year';
  return 'superscript';
}

// Check if a string contains a citation pattern
export function containsCitation(text: string): boolean {
  for (const pattern of CITATION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}

// Extract all citation keys from a text string
export function extractAllCitationKeys(text: string): string[] {
  const keys: string[] = [];
  for (const pattern of CITATION_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      keys.push(extractReferenceKey(match[0]));
    }
  }
  return keys;
}
