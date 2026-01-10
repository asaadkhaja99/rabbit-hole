export interface EquationAnnotationRequest {
  image_base64: string;
  question: string;
  aspect_ratio: number;
}

export interface EquationAnnotationResponse {
  image_base64: string;
}

export async function generateEquationAnnotationImage(
  imageDataUrl: string,
  question: string,
  aspectRatio: number
): Promise<string> {
  const base64 = imageDataUrl.includes(',')
    ? imageDataUrl.split(',')[1]
    : imageDataUrl;

  const body: EquationAnnotationRequest = {
    image_base64: base64,
    question,
    aspect_ratio: aspectRatio,
  };

  const response = await fetch('/api/equation/annotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = typeof data?.detail === 'string' ? data.detail : JSON.stringify(data);
    } catch (error) {
      detail = await response.text();
    }
    throw new Error(detail || `HTTP error: ${response.status}`);
  }

  const data = (await response.json()) as EquationAnnotationResponse;
  return `data:image/png;base64,${data.image_base64}`;
}
