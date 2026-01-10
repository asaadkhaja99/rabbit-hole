import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface BibliographyEntry {
  key: string;            // "1" or "Smith2020"
  authors: string[];
  title: string;
  year?: number;
  journal?: string;
  doi?: string;
  arxivId?: string;
  url?: string;
  rawText: string;        // Original text for fallback search
}

// Patterns for bibliography section detection
const BIBLIOGRAPHY_HEADERS = [
  /^references$/i,
  /^bibliography$/i,
  /^works cited$/i,
  /^literature cited$/i,
  /^literature$/i,
  /^cited works$/i,
];

const NUMBERED_REF_PATTERN = /^\[?(\d+)\]?\s*\.?\s*(.+)/;
const DOI_PATTERN = /10\.\d{4,}\/[^\s]+/;
const ARXIV_PATTERN = /arXiv[:\s]*(\d{4}\.\d{4,5})/i;
const YEAR_PATTERN = /\b(19|20)\d{2}\b/;

export async function extractBibliography(
  pdfDocument: PDFDocumentProxy
): Promise<Map<string, BibliographyEntry>> {
  const entries = new Map<string, BibliographyEntry>();

  // Find references section (usually last few pages)
  const startPage = Math.max(1, pdfDocument.numPages - 5);

  let inReferencesSection = false;
  let currentRef: Partial<BibliographyEntry> | null = null;
  let currentRefText = '';

  for (let pageNum = startPage; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();

    let lastY = 0;

    for (const item of textContent.items) {
      if (!('str' in item) || !('transform' in item)) continue;
      const text = item.str.trim();
      if (!text) continue;

      const y = item.transform[5];

      // Check for section header
      if (BIBLIOGRAPHY_HEADERS.some(p => p.test(text))) {
        inReferencesSection = true;
        continue;
      }

      if (!inReferencesSection) continue;

      // New line detection (Y position changed significantly)
      const isNewLine = Math.abs(y - lastY) > 5;
      lastY = y;

      // Parse numbered references
      const numberedMatch = text.match(NUMBERED_REF_PATTERN);
      if (numberedMatch && isNewLine) {
        // Save previous reference
        if (currentRef?.key && currentRefText) {
          const parsed = parseReferenceText(currentRefText);
          entries.set(currentRef.key, {
            key: currentRef.key,
            rawText: currentRefText,
            authors: parsed.authors || [],
            title: parsed.title || currentRefText.slice(0, 100),
            year: parsed.year,
            journal: parsed.journal,
            doi: parsed.doi,
            arxivId: parsed.arxivId,
          });
        }

        // Start new reference
        currentRef = { key: numberedMatch[1] };
        currentRefText = numberedMatch[2];
      } else if (currentRef && currentRefText) {
        // Continue building current reference
        currentRefText += ' ' + text;
      }
    }
  }

  // Save last reference
  if (currentRef?.key && currentRefText) {
    const parsed = parseReferenceText(currentRefText);
    entries.set(currentRef.key, {
      key: currentRef.key,
      rawText: currentRefText,
      authors: parsed.authors || [],
      title: parsed.title || currentRefText.slice(0, 100),
      year: parsed.year,
      journal: parsed.journal,
      doi: parsed.doi,
      arxivId: parsed.arxivId,
    });
  }

  return entries;
}

function parseReferenceText(text: string): Partial<BibliographyEntry> {
  const entry: Partial<BibliographyEntry> = {};

  // Extract DOI
  const doiMatch = text.match(DOI_PATTERN);
  if (doiMatch) entry.doi = doiMatch[0];

  // Extract arXiv ID
  const arxivMatch = text.match(ARXIV_PATTERN);
  if (arxivMatch) entry.arxivId = arxivMatch[1];

  // Extract year
  const yearMatch = text.match(YEAR_PATTERN);
  if (yearMatch) entry.year = parseInt(yearMatch[0]);

  // Try to extract authors (names before year or first period)
  // Common patterns: "Author, A., Author, B., and Author, C. (2020)" or
  // "A. Author, B. Author, C. Author. Title..."
  const authorsBeforeYear = text.split(yearMatch?.[0] || '.')[0];
  if (authorsBeforeYear.length < 200) {
    // Clean up and split by common separators
    const authorPart = authorsBeforeYear
      .replace(/\s+and\s+/gi, ', ')
      .replace(/\s+&\s+/g, ', ');

    // Try to detect author names (Initial. Lastname or Lastname, Initial.)
    const authorPattern = /(?:[A-Z]\.?\s*)+[A-Z][a-z]+|[A-Z][a-z]+,?\s+(?:[A-Z]\.?\s*)+/g;
    const authorMatches = authorPart.match(authorPattern);
    if (authorMatches && authorMatches.length > 0) {
      entry.authors = authorMatches.slice(0, 10); // Cap at 10 authors
    }
  }

  // Try to extract title (usually in quotes or after authors, before journal/year)
  // Look for quoted text first
  const quotedTitle = text.match(/"([^"]+)"|"([^"]+)"/);
  if (quotedTitle) {
    entry.title = quotedTitle[1] || quotedTitle[2];
  } else {
    // Take text after period following authors, before next period
    const parts = text.split(/\.\s+/);
    if (parts.length >= 2) {
      // First part is usually authors, second might be title
      const potentialTitle = parts[1];
      if (potentialTitle && potentialTitle.length > 10 && potentialTitle.length < 300) {
        entry.title = potentialTitle;
      }
    }
  }

  return entry;
}

// Get full text of a reference entry for display
export function formatReferenceDisplay(entry: BibliographyEntry): string {
  const parts: string[] = [];

  if (entry.authors.length > 0) {
    const authorStr = entry.authors.length > 3
      ? `${entry.authors[0]} et al.`
      : entry.authors.join(', ');
    parts.push(authorStr);
  }

  if (entry.year) {
    parts.push(`(${entry.year})`);
  }

  if (entry.title) {
    parts.push(entry.title);
  }

  if (entry.journal) {
    parts.push(entry.journal);
  }

  return parts.join('. ') || entry.rawText;
}
