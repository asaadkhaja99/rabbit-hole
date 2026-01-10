export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ReferenceSummary {
  title: string;
  authors: string;
  year?: number;
  summary: string;
}

/**
 * Get a brief summary of a reference using Gemini Flash
 */
export async function summarizeReference(
  referenceText: string,
  citationKey: string
): Promise<ReferenceSummary> {
  try {
    const response = await fetch('/api/reference/summarize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference_text: referenceText,
        citation_key: citationKey,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to summarize reference:', error);
    // Return a fallback
    return {
      title: `Reference: ${citationKey}`,
      authors: 'Unknown',
      summary: referenceText.slice(0, 150) + '...',
    };
  }
}

export interface ChatStreamCallbacks {
  onChunk: (text: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

export interface ChatRequest {
  question: string;
  context: string;
  page?: number;
  file_search_store_id?: string;
  history?: ChatMessage[];
}

export async function streamChat(
  question: string,
  context: string,
  pageNumber: number | undefined,
  fileSearchStoreId: string | undefined,
  history: ChatMessage[],
  callbacks: ChatStreamCallbacks
): Promise<void> {
  const body: ChatRequest = {
    question,
    context,
    ...(pageNumber && { page: pageNumber }),
    ...(fileSearchStoreId && { file_search_store_id: fileSearchStoreId }),
    ...(history.length > 0 && { history }),
  };

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) { callbacks.onError(data.error); return; }
            if (data.done) { callbacks.onComplete(); return; }
            if (data.text) { callbacks.onChunk(data.text); }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
    }
    callbacks.onComplete();
  } catch (error) {
    callbacks.onError(error instanceof Error ? error.message : 'Unknown error');
  }
}
