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

## API Endpoints

### PDF Management
- `POST /api/pdf/upload` - Upload PDF to File Search Store
- `GET /api/pdf/list` - List all uploaded PDFs
- `GET /api/pdf/{filename}` - Get specific PDF metadata

### Chat & Analysis
- `GET /api/chat/stream` - Stream chat responses (SSE)
- `GET /api/chat/formula` - Explain formulas
- `POST /api/chat/figure` - Analyze figures

### Learning Plans
- `POST /api/learning-plan/generate` - Start Deep Research
- `GET /api/learning-plan/status/{job_id}` - Check status

### Health
- `GET /api/health` - Health check

## Environment Variables

Create a `.env` file:

```env
GEMINI_API_KEY=your_api_key_here
```

Get your API key from: https://aistudio.google.com/apikey

## Features

- **Server-Sent Events (SSE)** for real-time streaming
- **File Search Store** integration for RAG-enhanced chat
- **Deep Research** with Google Search grounding
- **JSON persistence** for PDF mappings
- **CORS enabled** for development