export interface UploadPdfResponse {
  file_search_store_id: string;
  file_id?: string;
  display_name: string;
  status: 'ready' | 'processing';
  message?: string;
}

export async function uploadPdf(file: File, displayName?: string): Promise<UploadPdfResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (displayName) {
    formData.append('display_name', displayName);
  }

  const response = await fetch('/api/pdf/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  return response.json();
}
