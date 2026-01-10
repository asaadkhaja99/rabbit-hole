# Rabbit Hole

An intelligent PDF learning assistant powered by Google's Gemini AI that helps you deeply understand academic papers and technical documents through interactive exploration and visual equation annotations.

![Rabbit Hole](https://img.shields.io/badge/AI-Gemini%203-purple)
![License](https://img.shields.io/badge/license-MIT-blue)

## 🌟 Features

### 📄 Interactive PDF Analysis
- Upload and analyze PDF documents with AI-powered understanding
- Real-time text highlighting and selection
- Context-aware question answering with RAG (Retrieval-Augmented Generation)
- Multi-turn conversations with full context retention

### 🧮 Equation Annotation Mode
- **Visual Equation Selection**: Draw rectangles around equations in PDFs
- **AI-Powered Annotations**: Get handwritten-style annotations explaining equations
- **Interactive Display**: Click to show/hide annotated equation images (3x scaling for readability)
- **Persistent Highlights**: Green markers indicate annotated equations

### 🐰 Rabbit Hole System
- Create multiple "rabbit holes" to explore different aspects of your document
- Hierarchical exploration with visual rabbit hole paths
- Save and reopen previous explorations
- Interactive rabbit hole graph visualization showing connections

### 🎯 Smart Figure & Equation Detection
- Automatic extraction of figures and equations from PDFs
- Visual tooltips for figures with captions
- Specialized explanations for mathematical formulas

### 💾 Project Management
- Create and manage multiple PDF projects
- Persistent storage of all annotations and conversations
- Rename projects on the fly
- Track active and saved rabbit holes

## 🚀 Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- Google Gemini API Key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd rabbit-hole
   ```

2. **Set up the backend**
   ```bash
   # Install uv (Python package manager)
   curl -LsSf https://astral.sh/uv/install.sh | sh

   # Create virtual environment and install dependencies
   cd backend
   uv venv
   uv pip install -r requirements.txt
   ```

3. **Set up the frontend**
   ```bash
   cd frontend
   npm install
   ```

4. **Configure environment variables**

   Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

   Get your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

### Running the Application

1. **Start the backend server**
   ```bash
   cd backend
   uv run main.py
   ```
   Backend runs on `http://localhost:8000`

2. **Start the frontend development server**
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend runs on `http://localhost:5173` (Vite default)

3. **Access the application**

   Open your browser and navigate to `http://localhost:5173`

## 📖 Usage Guide

### Basic Workflow

1. **Upload a PDF**
   - Click "Back to Projects" or start screen
   - Upload your PDF document
   - Wait for indexing to complete

2. **Explore with Text Selection**
   - Highlight any text in the PDF
   - Click the "Rabbit Hole" button that appears
   - Ask questions about the selected text
   - View AI responses in interactive windows

3. **Annotate Equations**
   - Click the "Equation" button in the toolbar (turns purple when active)
   - Draw a rectangle around any equation
   - Enter your question about the equation
   - Click submit to generate an annotated image
   - Click the green box to toggle the annotated image display

4. **Manage Rabbit Holes**
   - View all rabbit holes in the sidebar
   - Click "Map" to see the rabbit hole graph
   - Reopen saved rabbit holes
   - Delete unwanted explorations

### Equation Annotation Features

- **Selection**: Draw precise rectangles around equations
- **Questions**: Ask specific questions like "What does each term mean?"
- **AI Generation**: Gemini 3 Pro generates annotated images with handwritten-style explanations
- **Display**: Annotated images scale to 3x selection size for clarity
- **Interaction**: Click green boxes to show/hide annotations
- **Persistence**: All annotations are saved with your project

## 🏗️ Architecture

### Backend (`/backend`)

**Technology Stack:**
- FastAPI (Python web framework)
- Google Gemini 3 (AI models)
- Pydantic (data validation)
- python-dotenv (environment management)

**Key Components:**
- `main.py`: FastAPI application with streaming endpoints
- `models.py`: Pydantic models for request/response validation
- `storage.py`: JSON-based persistent storage
- `prompts.yaml`: System prompts for different AI tasks

**API Endpoints:**
- `POST /api/pdf/upload`: Upload and index PDFs
- `GET /api/pdf/list`: List all uploaded PDFs
- `POST /api/chat/stream`: Stream AI responses (SSE)
- `POST /api/equation/annotate`: Generate equation annotations
- `POST /api/learning-plan/generate`: Create learning plans with Deep Research

### Frontend (`/frontend`)

**Technology Stack:**
- React 18 + TypeScript
- Vite (build tool)
- TailwindCSS (styling)
- react-pdf-highlighter-extended (PDF rendering & highlighting)
- Sonner (toast notifications)

**Key Components:**
- `App.tsx`: Main application state and orchestration
- `pdf-viewer.tsx`: PDF rendering with annotations
- `toolbar.tsx`: Top navigation and controls
- `rabbit-hole-window.tsx`: Chat interface windows
- `rabbit-hole-graph.tsx`: Visual rabbit hole connections

**State Management:**
- React hooks for local state
- Custom hooks for figure/equation stores
- LocalStorage for project persistence

## 🎨 User Interface

### Main Screen
- **Toolbar**: Project name, rabbit hole count, zoom controls, Equation/Map buttons
- **PDF Viewer**: Main document display with interactive annotations
- **Sidebar**: List of saved rabbit holes
- **Rabbit Hole Windows**: Draggable chat windows for conversations

### Equation Mode
- **Purple Button**: Indicates active equation mode
- **Blue Rectangle**: Drawing preview while selecting
- **Green Box**: Persisted equation with annotation
- **Tooltip**: Input field for equation questions

### Visual Indicators
- 🟢 Green highlights: Saved rabbit holes
- 🟣 Purple highlights: Active rabbit holes
- 🔵 Blue border: Equation selection in progress
- 🟢 Green border: Annotated equations

## 🔧 Configuration

### Backend Settings

Edit `backend/prompts.yaml` to customize AI behavior:

```yaml
chat:
  system_prompt: "Your custom prompt..."

formula:
  system_prompt: "Formula explanation prompt..."

equation_annotation:
  system_prompt: "Create an image that reproduces the equation..."
```

### Frontend Settings

- **Zoom levels**: Adjust in `App.tsx` (0.5x to 2x)
- **Equation scale factor**: Currently 3x in `pdf-viewer.tsx` line 917
- **Aspect ratios**: Gemini supports 1:1, 4:3, 3:4, 16:9, 9:16

## 📊 Data Storage

All data is stored locally in JSON files:

- `backend/data/pdfs.json`: PDF metadata and file search store IDs
- `backend/data/jobs.json`: Background job status
- Frontend LocalStorage: Projects and rabbit holes

## 🤖 AI Models Used

- **gemini-3-flash-preview**: Fast responses for chat and text analysis
- **gemini-3-pro-image-preview**: High-quality equation annotation images
- **Google Search**: Deep Research for learning plans

## 🐛 Troubleshooting

### Common Issues

1. **PDF not loading**
   - Check file size (large PDFs take time to index)
   - Verify GEMINI_API_KEY is set correctly

2. **Equation button disappearing**
   - Fixed with z-index 10000 on toolbar
   - Drawing overlay uses z-index 100

3. **Image generation slow**
   - Gemini 3 Pro Image takes 10-30 seconds
   - No speed parameters available for quality models

4. **Backend errors**
   - Check console logs for detailed error messages
   - Verify Python dependencies are installed
   - Ensure backend is running on port 8000

## 🔐 Security Notes

- API keys are stored in `.env` (never commit!)
- CORS is enabled for development (restrict in production)
- File uploads go to `/tmp/rabbit-hole` directory
- No authentication implemented (add for production use)


## 📝 License

MIT License - feel free to use and modify for your projects.

## 🙏 Acknowledgments

- Google Gemini AI for powerful language and image models
- react-pdf-highlighter-extended for PDF interaction
- The open-source community

## 📧 Support

For issues and questions:
- Create an issue on GitHub
- Check existing issues for solutions
- Review console logs for detailed error messages

---

Built with ❤️ for deeper understanding of complex documents.
