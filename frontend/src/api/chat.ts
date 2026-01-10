export interface ChatStreamCallbacks {
  onChunk: (text: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

export async function streamChat(
  question: string,
  context: string,
  pageNumber: number | undefined,
  fileSearchStoreId: string | undefined,
  callbacks: ChatStreamCallbacks
): Promise<void> {
  const params = new URLSearchParams({
    question,
    context,
    ...(pageNumber && { page: pageNumber.toString() }),
    ...(fileSearchStoreId && { file_search_store_id: fileSearchStoreId }),
  });

  try {
    const response = await fetch(`/api/chat/stream?${params}`, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
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
