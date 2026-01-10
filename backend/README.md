# Rabbit Hole Backend

FastAPI backend for PDF learning assistant with Gemini AI integration.

## Quick Start

```bash
# From project root, install dependencies
uv pip install -e .

# Set up environment
cd backend
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# Run server
python main.py
```

Server runs at: `http://localhost:8000`
API docs at: `http://localhost:8000/docs`

## Project Structure

```
backend/
├── main.py              # FastAPI endpoints
├── models.py            # Pydantic models
├── storage.py           # JSON-based persistence
├── prompts.yaml         # AI system prompts
├── .env.example         # Environment template
├── .env                 # Your API keys (gitignored)
└── data/                # Auto-created storage
    ├── pdfs.json        # PDF metadata
    └── jobs.json        # Background jobs

../pyproject.toml        # Dependencies managed at root
```

---

## Frontend Integration Guide

### Base URL
All endpoints are prefixed with the base URL: `http://localhost:8000`

### CORS
CORS is enabled for all origins in development. All requests will succeed from any frontend origin.

---

## API Endpoints

### 1. Health Check
**GET** `/api/health`

Simple health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "rabbit-hole-api"
}
```

**Example:**
```bash
curl http://localhost:8000/api/health
```

---

### 2. Upload PDF
**POST** `/api/pdf/upload`

Upload a PDF file to Gemini File Search Store for RAG-enhanced queries.

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `file` (required): PDF file
  - `display_name` (optional): Human-readable name for the PDF

**Response:**
```json
{
  "file_search_store_id": "fileSearchStores/attention-is-all-you-need-9495dhtkcmiy",
  "file_id": null,
  "filename": "1706.03762v7.pdf",
  "display_name": "Attention Is All You Need",
  "status": "ready",
  "upload_time": "2026-01-10T11:28:35.050309",
  "message": null
}
```

**Important Fields:**
- `file_search_store_id`: Use this ID in chat stream requests to enable RAG
- `filename`: Use this to retrieve PDF info later
- `status`: "ready" when indexing complete, "processing" if still indexing

**Example (curl):**
```bash
curl -X POST "http://localhost:8000/api/pdf/upload" \
  -F "file=@/path/to/paper.pdf" \
  -F "display_name=My Research Paper"
```

**Example (JavaScript):**
```javascript
const formData = new FormData();
formData.append('file', pdfFile);
formData.append('display_name', 'My Research Paper');

const response = await fetch('http://localhost:8000/api/pdf/upload', {
  method: 'POST',
  body: formData
});

const data = await response.json();
console.log(data.file_search_store_id); // Use this for RAG queries
```

---

### 3. List All PDFs
**GET** `/api/pdf/list`

Get a list of all uploaded PDFs with their metadata.

**Response:**
```json
{
  "pdfs": [
    {
      "filename": "1706.03762v7.pdf",
      "display_name": "Attention Is All You Need",
      "file_search_store_id": "fileSearchStores/attention-is-all-you-need-9495dhtkcmiy",
      "file_id": null,
      "status": "ready",
      "upload_time": "2026-01-10T11:28:35.050309"
    }
  ],
  "total": 1
}
```

**Example:**
```bash
curl http://localhost:8000/api/pdf/list
```

**Example (JavaScript):**
```javascript
const response = await fetch('http://localhost:8000/api/pdf/list');
const data = await response.json();

data.pdfs.forEach(pdf => {
  console.log(`${pdf.display_name}: ${pdf.file_search_store_id}`);
});
```

---

### 4. Get PDF Info
**GET** `/api/pdf/{filename}`

Retrieve metadata for a specific PDF by its filename.

**Parameters:**
- `filename`: The original filename of the uploaded PDF

**Response:**
```json
{
  "filename": "1706.03762v7.pdf",
  "display_name": "Attention Is All You Need",
  "file_search_store_id": "fileSearchStores/attention-is-all-you-need-9495dhtkcmiy",
  "file_id": null,
  "status": "ready",
  "upload_time": "2026-01-10T11:28:35.050309"
}
```

**Example:**
```bash
curl "http://localhost:8000/api/pdf/1706.03762v7.pdf"
```

**Example (JavaScript):**
```javascript
const filename = "1706.03762v7.pdf";
const response = await fetch(`http://localhost:8000/api/pdf/${encodeURIComponent(filename)}`);
const pdfInfo = await response.json();
```

---

### 5. Chat Stream (with RAG)
**GET** `/api/chat/stream`

Stream AI responses for questions about PDF content. Uses Server-Sent Events (SSE) for real-time streaming.

**Query Parameters:**
- `question` (required): The user's question
- `context` (required): Highlighted text or section context
- `page` (optional): Page number for reference
- `file_search_store_id` (optional): Enable RAG by providing the File Search Store ID from PDF upload

**Response Format:** Server-Sent Events (SSE)

Each event is formatted as:
```
data: {"text": "chunk of response text"}

data: {"done": true}
```

**Example (curl):**
```bash
# Without RAG (basic context only)
curl -N "http://localhost:8000/api/chat/stream?question=What%20is%20this%20about&context=Machine%20learning%20is%20a%20branch%20of%20AI"

# With RAG (queries full PDF)
curl -N "http://localhost:8000/api/chat/stream?question=Explain%20the%20self-attention%20mechanism&context=Section%203.2&file_search_store_id=fileSearchStores/attention-is-all-you-need-9495dhtkcmiy"
```

**Example (JavaScript with EventSource):**
```javascript
const params = new URLSearchParams({
  question: "What is the transformer architecture?",
  context: "The paper introduces a new model architecture",
  file_search_store_id: "fileSearchStores/attention-is-all-you-need-9495dhtkcmiy"
});

const eventSource = new EventSource(`http://localhost:8000/api/chat/stream?${params}`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.done) {
    eventSource.close();
    console.log('Stream complete');
  } else if (data.text) {
    console.log('Chunk:', data.text);
    // Append to UI
  } else if (data.error) {
    console.error('Error:', data.error);
    eventSource.close();
  }
};

eventSource.onerror = (error) => {
  console.error('EventSource error:', error);
  eventSource.close();
};
```

**Example (JavaScript with fetch):**
```javascript
const params = new URLSearchParams({
  question: "What is the transformer architecture?",
  context: "The paper introduces a new model architecture",
  file_search_store_id: "fileSearchStores/attention-is-all-you-need-9495dhtkcmiy"
});

const response = await fetch(`http://localhost:8000/api/chat/stream?${params}`);
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      if (data.text) {
        console.log('Chunk:', data.text);
        // Append to UI
      }
      if (data.done) {
        console.log('Stream complete');
      }
    }
  }
}
```

**RAG Behavior:**
- **Without `file_search_store_id`**: AI responds based only on the provided `context`
- **With `file_search_store_id`**: AI can query the full PDF document for comprehensive answers

---

## Workflow for Frontend

### Typical User Flow

1. **Upload PDF**
   ```javascript
   const uploadResponse = await uploadPDF(file, displayName);
   const fileSearchStoreId = uploadResponse.file_search_store_id;
   // Store this ID for later use
   ```

2. **User highlights text and asks question**
   ```javascript
   const highlightedText = getHighlightedText();
   const question = getUserQuestion();

   streamChatResponse(question, highlightedText, fileSearchStoreId);
   ```

3. **Display streaming response**
   ```javascript
   // Use EventSource or fetch to stream response
   // Update UI with each chunk in real-time
   ```

### Error Handling

All endpoints return appropriate HTTP status codes:
- `200`: Success
- `400`: Bad request (missing required parameters)
- `404`: Resource not found
- `500`: Server error

Error responses include a `detail` field:
```json
{
  "detail": "Error message here"
}
```

---

## Data Persistence

All data is automatically persisted to JSON files in `backend/data/`:
- PDF metadata survives server restarts
- No database required
- Files are gitignored

---

## Testing

Interactive API documentation available at: `http://localhost:8000/docs`

Use this for:
- Testing endpoints directly in the browser
- Viewing request/response schemas
- Understanding parameter requirements

---

## Environment Variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_api_key_here
```

Get your API key from: https://aistudio.google.com/apikey

---

## Features

- **Server-Sent Events (SSE)** for real-time streaming responses
- **File Search Store** integration for RAG-enhanced PDF queries
- **Deep Research** with Google Search grounding (learning plans)
- **JSON persistence** for automatic data storage
- **CORS enabled** for development across all origins
- **Multimodal AI** support for analyzing figures and formulas