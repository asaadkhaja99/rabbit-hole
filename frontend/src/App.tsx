import React, { useState, useEffect, useCallback } from 'react';
import { Toolbar } from './components/toolbar';
import { PdfViewer, type ReferenceRabbitHoleInfo } from './components/pdf-viewer';
import { RabbitHolePopup } from './components/rabbit-hole-popup';
import { RabbitHoleGraph } from './components/rabbit-hole-graph';
import { ProjectSelector, Project } from './components/project-selector';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { uploadPdf, streamChat, ChatMessage, generateLearningSummary, generateEquationAnnotationImage } from './api';
import type { Highlight, GhostHighlight, ScaledPosition } from 'react-pdf-highlighter-extended';

// IndexedDB helpers for storing PDF files
const DB_NAME = 'RabbitHolePDFs';
const DB_VERSION = 1;
const STORE_NAME = 'pdfs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (event) => {
      const error = (event.target as IDBOpenDBRequest).error;
      // If version error, delete the database and retry
      if (error?.name === 'VersionError') {
        indexedDB.deleteDatabase(DB_NAME);
        const retryRequest = indexedDB.open(DB_NAME, DB_VERSION);
        retryRequest.onerror = () => reject(retryRequest.error);
        retryRequest.onsuccess = () => resolve(retryRequest.result);
        retryRequest.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
      } else {
        reject(error);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function savePdfToIndexedDB(projectId: string, file: File): Promise<void> {
  const db = await openDB();
  const arrayBuffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(arrayBuffer, projectId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function loadPdfFromIndexedDB(projectId: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(projectId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (request.result) {
        const blob = new Blob([request.result], { type: 'application/pdf' });
        resolve(URL.createObjectURL(blob));
      } else {
        resolve(null);
      }
    };
  });
}

async function deletePdfFromIndexedDB(projectId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(projectId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  pageReference?: number;
  imageDataUrl?: string;  // For figure images in conversations
}

// Re-export for use in other components
export type { Highlight, GhostHighlight, ScaledPosition };

export interface RabbitHoleWindow {
  id: string;  // Same as SavedRabbitHole id - links to saved data
  selectedText: string;
  topic: string;
  pageReference: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  messages: Message[];
  timestamp: Date;
  parentId?: string;
  depth: number;
  highlightPosition?: ScaledPosition;
}

export interface SavedRabbitHole {
  id: string;
  selectedText: string;
  pageReference: number;
  summary: string;
  messages: Message[];
  rabbitHolePath: string[];
  timestamp: Date;
  highlightPosition?: ScaledPosition;
  parentId?: string;
  depth: number;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  
  const [rabbitHoleWindows, setRabbitHoleWindows] = useState<RabbitHoleWindow[]>([]);
  const [savedRabbitHoles, setSavedRabbitHoles] = useState<SavedRabbitHole[]>([]);
  const [showRabbitHoleGraph, setShowRabbitHoleGraph] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizeHovered, setIsResizeHovered] = useState(false);
  const [scrollToHighlightId, setScrollToHighlightId] = useState<string | null>(null);
  const [learningSummary, setLearningSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isEquationMode, setIsEquationMode] = useState(false);
  const [persistedEquations, setPersistedEquations] = useState<Array<{
    id: string;
    bounds: { left: number; top: number; width: number; height: number };
    pageNumber: number;
    imageDataUrl?: string;
  }>>([]);

  // Load projects from localStorage on mount and restore current project
  useEffect(() => {
    const loadProjects = async () => {
      const savedProjects = localStorage.getItem('pdfProjects');
      if (savedProjects) {
        try {
          const parsed = JSON.parse(savedProjects);
          const loadedProjects = parsed.map((p: any) => ({
            ...p,
            createdAt: new Date(p.createdAt),
            lastModified: new Date(p.lastModified),
          }));
          setProjects(loadedProjects);

          // Restore current project if previously selected
          const savedProjectId = localStorage.getItem('currentProjectId');
          if (savedProjectId) {
            const project = loadedProjects.find((p: Project) => p.id === savedProjectId);
            if (project) {
              // Load PDF from IndexedDB
              const pdfUrl = await loadPdfFromIndexedDB(savedProjectId);
              if (pdfUrl) {
                setCurrentProject(project);
                setPdfFile(pdfUrl);
              }
            }
          }
        } catch (e) {
          console.error('Failed to load projects:', e);
        }
      }
    };
    loadProjects();
  }, []);

  // Save projects to localStorage whenever they change
  useEffect(() => {
    if (projects.length > 0) {
      localStorage.setItem('pdfProjects', JSON.stringify(projects));
    }
  }, [projects]);

  // Save current project ID to localStorage
  useEffect(() => {
    if (currentProject) {
      localStorage.setItem('currentProjectId', currentProject.id);
    } else {
      localStorage.removeItem('currentProjectId');
    }
  }, [currentProject]);

  // Load project-specific comments when project changes
  useEffect(() => {
    if (currentProject) {
      const savedComments = localStorage.getItem(`project_${currentProject.id}_rabbitHoles`);
      if (savedComments) {
        try {
          const parsed = JSON.parse(savedComments);
          setSavedRabbitHoles(parsed.map((c: any) => ({
            ...c,
            timestamp: new Date(c.timestamp),
          })));
        } catch (e) {
          console.error('Failed to load comments:', e);
        }
      } else {
        setSavedRabbitHoles([]);
      }
    }
  }, [currentProject]);

  // Save rabbit holes to localStorage whenever they change (project-specific)
  useEffect(() => {
    if (currentProject) {
      localStorage.setItem(`project_${currentProject.id}_rabbitHoles`, JSON.stringify(savedRabbitHoles));

      // Update project's rabbit hole count
      setProjects(prev => prev.map(p =>
        p.id === currentProject.id
          ? { ...p, rabbitHolesCount: savedRabbitHoles.length, lastModified: new Date() }
          : p
      ));
    }
  }, [savedRabbitHoles, currentProject]);

  // Handle sidebar resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setSidebarWidth(Math.max(300, Math.min(800, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const handleFileUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    setPdfFile(url);
    setCurrentPage(1);
    setLearningSummary(null);  // Reset summary for new PDF
  };

  const handleStartRabbitHole = (selectedText: string, pageReference: number, parentId?: string, highlightPosition?: ScaledPosition) => {
    // Find parent depth from either open window or saved comment
    const parentWindow = parentId ? rabbitHoleWindows.find(w => w.id === parentId) : null;
    const parentSaved = parentId ? savedRabbitHoles.find(c => c.id === parentId) : null;
    const parentDepth = parentWindow?.depth ?? parentSaved?.depth ?? -1;
    const depth = parentDepth + 1;

    const id = Date.now().toString();
    const topic = selectedText.substring(0, 50) + (selectedText.length > 50 ? '...' : '');
    const initialMessage: Message = {
      id: id + '_msg',
      role: 'assistant',
      content: `What would you like to know about this?`,
      timestamp: new Date(),
    };

    // Create and SAVE the rabbit hole immediately
    const newSavedRabbitHole: SavedRabbitHole = {
      id,
      selectedText,
      pageReference,
      summary: 'Exploring...',
      messages: [initialMessage],
      rabbitHolePath: [topic],
      timestamp: new Date(),
      highlightPosition,
      parentId,
      depth,
    };
    setSavedRabbitHoles(prev => [...prev, newSavedRabbitHole]);

    // Stack windows vertically on the right side
    const existingCount = rabbitHoleWindows.length;
    const yOffset = existingCount * 20;

    // Create the UI window (references the saved comment by ID)
    const newWindow: RabbitHoleWindow = {
      id,  // Same ID as saved comment
      selectedText,
      topic,
      pageReference,
      position: { x: window.innerWidth - 420, y: 80 + yOffset },
      size: { width: 400, height: 500 },
      messages: [initialMessage],
      timestamp: new Date(),
      parentId,
      depth,
      highlightPosition,
    };
    setRabbitHoleWindows(prev => [...prev, newWindow]);
  };

  const handleStartFigureRabbitHole = (question: string, imageDataUrl: string, figureNumber: string, pageNumber: number) => {
    const id = Date.now().toString();
    const topic = `Figure ${figureNumber}: ${question.substring(0, 30)}${question.length > 30 ? '...' : ''}`;

    // Create user message with the image and question
    const userMessage: Message = {
      id: id + '_user',
      role: 'user',
      content: question,
      timestamp: new Date(),
      pageReference: pageNumber,
      imageDataUrl,
    };

    // Create placeholder AI message for streaming
    const aiMessageId = id + '_ai';
    const aiMessage: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      pageReference: pageNumber,
    };

    // Create and SAVE the rabbit hole immediately
    const newSavedRabbitHole: SavedRabbitHole = {
      id,
      selectedText: `Figure ${figureNumber}`,
      pageReference: pageNumber,
      summary: 'Analyzing figure...',
      messages: [userMessage, aiMessage],
      rabbitHolePath: [topic],
      timestamp: new Date(),
      depth: 0,
    };
    setSavedRabbitHoles(prev => [...prev, newSavedRabbitHole]);

    // Stack windows vertically on the right side
    const existingCount = rabbitHoleWindows.length;
    const yOffset = existingCount * 20;

    // Create the UI window
    const newWindow: RabbitHoleWindow = {
      id,
      selectedText: `Figure ${figureNumber}`,
      topic,
      pageReference: pageNumber,
      position: { x: window.innerWidth - 420, y: 80 + yOffset },
      size: { width: 400, height: 500 },
      messages: [userMessage, aiMessage],
      timestamp: new Date(),
      depth: 0,
    };
    setRabbitHoleWindows(prev => [...prev, newWindow]);

    // Start streaming response - include image context in the question
    const contextWithImage = `[User is asking about Figure ${figureNumber} from the PDF]\n\nQuestion: ${question}`;

    streamChat(
      contextWithImage,
      `Figure ${figureNumber}`,
      pageNumber,
      currentProject?.fileSearchStoreId,
      [], // No history for new figure conversation
      {
        onChunk: (text) => {
          setRabbitHoleWindows(prev =>
            prev.map(w =>
              w.id === id
                ? {
                    ...w,
                    messages: w.messages.map(m =>
                      m.id === aiMessageId
                        ? { ...m, content: m.content + text }
                        : m
                    ),
                  }
                : w
            )
          );

          setSavedRabbitHoles(prev =>
            prev.map(c =>
              c.id === id
                ? {
                    ...c,
                    messages: c.messages.map(m =>
                      m.id === aiMessageId
                        ? { ...m, content: m.content + text }
                        : m
                    ),
                  }
                : c
            )
          );
        },
        onComplete: () => {
          console.log('Figure analysis complete');
        },
        onError: (error) => {
          setRabbitHoleWindows(prev =>
            prev.map(w =>
              w.id === id
                ? {
                    ...w,
                    messages: w.messages.map(m =>
                      m.id === aiMessageId
                        ? { ...m, content: `Error: ${error}. Please try again.` }
                        : m
                    ),
                  }
                : w
            )
          );
        },
      }
    );
  };

  const handleStartReferenceRabbitHole = (info: ReferenceRabbitHoleInfo) => {
    const id = Date.now().toString();
    const topic = `Ref ${info.citationKey}: ${info.referenceTitle.substring(0, 40)}${info.referenceTitle.length > 40 ? '...' : ''}`;

    // Build the pre-built prompt for reference analysis (sent to API, not shown to user)
    const prompt = `I'm reading a paper and encountered reference ${info.citationKey}.

**Current Context (paragraph containing the citation):**
"${info.paragraphContext}"

**Referenced Paper:**
- Title: ${info.referenceTitle}
- Authors: ${info.referenceAuthors}
${info.referenceYear ? `- Year: ${info.referenceYear}` : ''}

**Please explain:**
1. What specific part/concept from the referenced paper is being cited here?
2. Why is this reference relevant to the current context?
3. What are the key insights from the referenced work that apply here?
4. How does this reference support or relate to the main argument?

Use the full paper context from my uploaded PDF to provide accurate analysis.`;

    // Simple display message shown to user
    const displayText = `Understanding the relevance of reference ${info.citationKey}...`;

    // Create user message with simple display text (full prompt sent separately to API)
    const userMessage: Message = {
      id: id + '_user',
      role: 'user',
      content: displayText,
      timestamp: new Date(),
      pageReference: info.pageNumber,
    };

    // Create placeholder AI message for streaming
    const aiMessageId = id + '_ai';
    const aiMessage: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      pageReference: info.pageNumber,
    };

    // Create and SAVE the rabbit hole immediately
    const newSavedRabbitHole: SavedRabbitHole = {
      id,
      selectedText: info.paragraphContext.substring(0, 100),
      pageReference: info.pageNumber,
      summary: `Analyzing reference ${info.citationKey}...`,
      messages: [userMessage, aiMessage],
      rabbitHolePath: [topic],
      timestamp: new Date(),
      depth: 0,
    };
    setSavedRabbitHoles(prev => [...prev, newSavedRabbitHole]);

    // Stack windows vertically on the right side
    const existingCount = rabbitHoleWindows.length;
    const yOffset = existingCount * 20;

    // Create the UI window
    const newWindow: RabbitHoleWindow = {
      id,
      selectedText: info.paragraphContext.substring(0, 100),
      topic,
      pageReference: info.pageNumber,
      position: { x: window.innerWidth - 420, y: 80 + yOffset },
      size: { width: 400, height: 500 },
      messages: [userMessage, aiMessage],
      timestamp: new Date(),
      depth: 0,
    };
    setRabbitHoleWindows(prev => [...prev, newWindow]);

    // Stream response from Gemini
    streamChat(
      prompt,
      info.paragraphContext,
      info.pageNumber,
      currentProject?.fileSearchStoreId,
      [], // No history for new reference conversation
      {
        onChunk: (text) => {
          setRabbitHoleWindows(prev =>
            prev.map(w =>
              w.id === id
                ? {
                    ...w,
                    messages: w.messages.map(m =>
                      m.id === aiMessageId
                        ? { ...m, content: m.content + text }
                        : m
                    ),
                  }
                : w
            )
          );

          setSavedRabbitHoles(prev =>
            prev.map(c =>
              c.id === id
                ? {
                    ...c,
                    messages: c.messages.map(m =>
                      m.id === aiMessageId
                        ? { ...m, content: m.content + text }
                        : m
                    ),
                  }
                : c
            )
          );
        },
        onComplete: () => {
          console.log('Reference analysis complete');
        },
        onError: (error) => {
          setRabbitHoleWindows(prev =>
            prev.map(w =>
              w.id === id
                ? {
                    ...w,
                    messages: w.messages.map(m =>
                      m.id === aiMessageId
                        ? { ...m, content: `Error: ${error}. Please try again.` }
                        : m
                    ),
                  }
                : w
            )
          );
        },
      }
    );
  };

  const handleStartEquationRabbitHole = (
    question: string,
    imageDataUrl: string,
    equationNumber: string,
    pageNumber: number,
    bounds: { left: number; top: number; width: number; height: number }
  ) => {
    const id = Date.now().toString();

    // Add to persisted equations so it shows on the PDF
    setPersistedEquations(prev => [...prev, {
      id,
      bounds,
      pageNumber,
    }]);

    // Calculate aspect ratio from bounds (width:height)
    const aspectRatio = bounds.width / bounds.height;

    const toastId = toast.loading('Processing equation...');
    generateEquationAnnotationImage(imageDataUrl, question, aspectRatio)
      .then((annotatedImageDataUrl) => {
        setPersistedEquations(prev =>
          prev.map(eq => (eq.id === id ? { ...eq, imageDataUrl: annotatedImageDataUrl } : eq))
        );
        toast.success('Equation processed', { id: toastId });
      })
      .catch((error) => {
        console.error('Failed to generate annotated equation image:', error);
        toast.error('Failed to process equation', { id: toastId });
      });
  };

  const handleCloseRabbitHole = (windowId: string) => {
    const window = rabbitHoleWindows.find(w => w.id === windowId);
    if (!window) return;

    // Update the saved comment with final summary before closing
    const insights = window.messages
      .filter(m => m.role === 'assistant')
      .map(m => m.content.substring(0, 150))
      .join(' | ');

    setSavedRabbitHoles(prev => prev.map(c =>
      c.id === windowId
        ? { ...c, summary: insights || 'No insights captured', messages: window.messages }
        : c
    ));

    // Just close the window - comment already saved
    setRabbitHoleWindows(prev => prev.filter(w => w.id !== windowId));
  };

  const handleDeleteRabbitHole = (rabbitHoleId: string) => {
    setSavedRabbitHoles(prev => prev.filter(rh => rh.id !== rabbitHoleId));
  };

  const handleUpdateRabbitHolePosition = (windowId: string, position: { x: number; y: number }) => {
    setRabbitHoleWindows(prev =>
      prev.map(w => (w.id === windowId ? { ...w, position } : w))
    );
  };

  const handleUpdateRabbitHoleSize = (windowId: string, size: { width: number; height: number }) => {
    setRabbitHoleWindows(prev =>
      prev.map(w => (w.id === windowId ? { ...w, size } : w))
    );
  };

  const handleReopenRabbitHole = (rabbitHole: SavedRabbitHole) => {
    // Check if already open
    if (rabbitHoleWindows.some(w => w.id === rabbitHole.id)) {
      return; // Already open, don't duplicate
    }

    // Use stored depth, fallback to path length for old data
    const depth = rabbitHole.depth ?? (rabbitHole.rabbitHolePath.length - 1);

    // Stack windows vertically on the right side
    const existingCount = rabbitHoleWindows.length;
    const yOffset = existingCount * 20;

    const reopenedWindow: RabbitHoleWindow = {
      id: rabbitHole.id,
      selectedText: rabbitHole.selectedText,
      topic: rabbitHole.selectedText.substring(0, 50) + (rabbitHole.selectedText.length > 50 ? '...' : ''),
      pageReference: rabbitHole.pageReference,
      position: { x: window.innerWidth - 420, y: 80 + yOffset },
      size: { width: 400, height: 500 },
      messages: rabbitHole.messages,
      timestamp: new Date(),
      parentId: rabbitHole.parentId,
      depth,
      highlightPosition: rabbitHole.highlightPosition,
    };

    setRabbitHoleWindows(prev => [...prev, reopenedWindow]);
  };

  const handleRabbitHoleSendMessage = (windowId: string, content: string) => {
    const window = rabbitHoleWindows.find(w => w.id === windowId);
    if (!window) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
      pageReference: window.pageReference,
    };

    setRabbitHoleWindows(prev =>
      prev.map(w =>
        w.id === windowId
          ? { ...w, messages: [...w.messages, userMessage] }
          : w
      )
    );

    setSavedRabbitHoles(prev =>
      prev.map(c =>
        c.id === windowId
          ? { ...c, messages: [...c.messages, userMessage] }
          : c
      )
    );

    // Create placeholder AI message for streaming
    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      pageReference: window.pageReference,
    };

    setRabbitHoleWindows(prev =>
      prev.map(w =>
        w.id === windowId
          ? { ...w, messages: [...w.messages, aiMessage] }
          : w
      )
    );

    setSavedRabbitHoles(prev =>
      prev.map(c =>
        c.id === windowId
          ? { ...c, messages: [...c.messages, aiMessage] }
          : c
      )
    );

    // Build conversation history from previous messages (exclude first welcome message)
    const history: ChatMessage[] = window.messages
      .slice(1) // Skip first assistant welcome message
      .map(m => ({
        role: m.role,
        content: m.content,
      }));

    // Stream response from backend (pass fileSearchStoreId for RAG)
    streamChat(
      content,
      window.selectedText,
      window.pageReference,
      currentProject?.fileSearchStoreId,
      history,
      {
        onChunk: (text) => {
          setRabbitHoleWindows(prev =>
            prev.map(w =>
              w.id === windowId
                ? {
                    ...w,
                    messages: w.messages.map(m =>
                      m.id === aiMessageId
                        ? { ...m, content: m.content + text }
                        : m
                    ),
                  }
                : w
            )
          );

          setSavedRabbitHoles(prev =>
            prev.map(c =>
              c.id === windowId
                ? {
                    ...c,
                    messages: c.messages.map(m =>
                      m.id === aiMessageId
                        ? { ...m, content: m.content + text }
                        : m
                    ),
                  }
                : c
            )
          );
        },
        onComplete: () => {
          console.log('Streaming complete');
        },
        onError: (error) => {
          setRabbitHoleWindows(prev =>
            prev.map(w =>
              w.id === windowId
                ? {
                    ...w,
                    messages: w.messages.map(m =>
                      m.id === aiMessageId
                        ? { ...m, content: `Error: ${error}. Please try again.` }
                        : m
                    ),
                  }
                : w
            )
          );
        },
      }
    );
  };

  const handleCreateProject = async (file: File) => {
    const projectId = Date.now().toString();
    const url = URL.createObjectURL(file);

    // Save PDF to IndexedDB for persistence across refreshes
    await savePdfToIndexedDB(projectId, file);

    const newProject: Project = {
      id: projectId,
      name: file.name.replace('.pdf', ''),
      pdfFile: url,
      pdfName: file.name,
      createdAt: new Date(),
      lastModified: new Date(),
      rabbitHolesCount: 0,
    };

    setProjects(prev => [newProject, ...prev]);
    setCurrentProject(newProject);
    setPdfFile(url);
    setCurrentPage(1);
    setSavedRabbitHoles([]);
    setRabbitHoleWindows([]);

    // Upload to backend for Gemini File Search (non-blocking)
    uploadPdf(file, file.name)
      .then((result) => {
        // Update project with fileSearchStoreId
        setProjects(prev =>
          prev.map(p =>
            p.id === projectId
              ? { ...p, fileSearchStoreId: result.file_search_store_id }
              : p
          )
        );
        setCurrentProject(prev =>
          prev?.id === projectId
            ? { ...prev, fileSearchStoreId: result.file_search_store_id }
            : prev
        );
        toast.success('Uploaded to Gemini File Search');
      })
      .catch(() => {
        toast.error('Failed to upload to Gemini File Search');
      });
  };

  const handleSelectProject = async (project: Project) => {
    setCurrentProject(project);
    // Load PDF from IndexedDB
    const pdfUrl = await loadPdfFromIndexedDB(project.id);
    setPdfFile(pdfUrl);
    setCurrentPage(1);
    setRabbitHoleWindows([]);
    setLearningSummary(null);  // Reset summary for new project
  };

  const handleDeleteProject = async (projectId: string) => {
    // Delete project, its rabbit holes, and PDF from IndexedDB
    localStorage.removeItem(`project_${projectId}_rabbitHoles`);
    await deletePdfFromIndexedDB(projectId);
    setProjects(prev => prev.filter(p => p.id !== projectId));

    if (currentProject?.id === projectId) {
      setCurrentProject(null);
      setPdfFile(null);
      setSavedRabbitHoles([]);
      setRabbitHoleWindows([]);
      }
  };

  const handleBackToProjects = () => {
    setCurrentProject(null);
    setPdfFile(null);
    setSavedRabbitHoles([]);
    setRabbitHoleWindows([]);
    setLearningSummary(null);  // Reset summary when leaving project
  };

  const handleProjectNameChange = (newName: string) => {
    if (currentProject) {
      const updatedProject = { ...currentProject, name: newName, lastModified: new Date() };
      setCurrentProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === currentProject.id ? updatedProject : p));
    }
  };

  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(prev + 0.2, 3.0));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(prev - 0.2, 0.5));
  }, []);

  const handleMapNodeClick = (nodeId: string) => {
    const rabbitHole = savedRabbitHoles.find(rh => rh.id === nodeId);
    if (rabbitHole) {
      // Check if already open
      const isOpen = rabbitHoleWindows.some(w => w.id === nodeId);
      if (!isOpen) {
        handleReopenRabbitHole(rabbitHole);
      }
      // Navigate to the page and scroll to highlight
      setCurrentPage(rabbitHole.pageReference);
      if (rabbitHole.highlightPosition) {
        setScrollToHighlightId(`rabbithole-${rabbitHole.id}`);
      }
      setShowRabbitHoleGraph(false);
    }
  };

  // Generate learning summary from all rabbit holes
  const handleGenerateSummary = async () => {
    if (savedRabbitHoles.length === 0) {
      toast.error('No rabbit holes to summarize');
      return;
    }

    setIsSummarizing(true);
    try {
      // Prepare rabbit hole data for summarization
      const rabbitHoleData = savedRabbitHoles.map(rh => ({
        id: rh.id,
        topic: rh.rabbitHolePath?.[0] || rh.selectedText.substring(0, 50),
        selectedText: rh.selectedText,
        messages: rh.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        pageReference: rh.pageReference,
      }));

      const response = await generateLearningSummary(rabbitHoleData);
      setLearningSummary(response.summary);
      toast.success('Learning summary generated!');
    } catch (error) {
      console.error('Failed to generate summary:', error);
      toast.error('Failed to generate learning summary');
    } finally {
      setIsSummarizing(false);
    }
  };

  // Show project selector if no project is selected
  if (!currentProject) {
    return (
      <ProjectSelector
        projects={projects}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#f9f9f9]">
      <Toolbar
        pdfFile={pdfFile}
        projectName={currentProject.name}
        onFileUpload={handleFileUpload}
        onToggleRabbitHoleGraph={() => setShowRabbitHoleGraph(!showRabbitHoleGraph)}
        onBackToProjects={handleBackToProjects}
        onProjectNameChange={handleProjectNameChange}
        showGraph={showRabbitHoleGraph}
        activeRabbitHoles={rabbitHoleWindows.length}
        savedRabbitHolesCount={savedRabbitHoles.filter(rh => rh.depth === 0).length}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        zoomLevel={zoomLevel}
        onToggleEquationMode={() => setIsEquationMode(!isEquationMode)}
        isEquationMode={isEquationMode}
      />
      
      <div className="flex flex-1 overflow-hidden">
        {/* PDF Viewer - Full Width */}
        <div className="flex-1 bg-gray-100">
          <PdfViewer
            file={pdfFile}
            currentPage={currentPage}
            numPages={numPages}
            onPageChange={setCurrentPage}
            onDocumentLoad={setNumPages}
            onStartRabbitHole={handleStartRabbitHole}
            onStartFigureRabbitHole={handleStartFigureRabbitHole}
            onStartReferenceRabbitHole={handleStartReferenceRabbitHole}
            onStartEquationRabbitHole={handleStartEquationRabbitHole}
            savedRabbitHoles={savedRabbitHoles}
            onDeleteRabbitHole={handleDeleteRabbitHole}
            onReopenRabbitHole={handleReopenRabbitHole}
            activeRabbitHoles={rabbitHoleWindows}
            zoomLevel={zoomLevel}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            scrollToHighlightId={scrollToHighlightId}
            onScrollComplete={() => setScrollToHighlightId(null)}
            isEquationMode={isEquationMode}
            persistedEquations={persistedEquations}
          />
        </div>
      </div>

      {/* Fixed Right Sidebar - Overlays on top of grey space */}
      {rabbitHoleWindows.length > 0 && (
        <>
          {/* Resize Handle - separate fixed element */}
          <div
            className="fixed bottom-0 cursor-ew-resize z-50 flex items-center justify-center"
            style={{
              right: sidebarWidth - 6,
              top: 56,
              width: 12,
              backgroundColor: isResizeHovered || isResizing ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
            }}
            onMouseEnter={() => setIsResizeHovered(true)}
            onMouseLeave={() => setIsResizeHovered(false)}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsResizing(true);
            }}
          >
            {/* Grip indicator */}
            <div
              className="rounded-full transition-all duration-150"
              style={{
                width: isResizeHovered || isResizing ? 6 : 4,
                height: isResizeHovered || isResizing ? 64 : 48,
                backgroundColor: isResizing ? '#9333ea' : (isResizeHovered ? '#a855f7' : '#cbd5e1'),
              }}
            />
          </div>

          <div
            className="fixed right-0 border-l border-slate-200 shadow-xl z-40 flex flex-col overflow-y-auto"
            style={{
              width: sidebarWidth,
              top: 56,
              bottom: 0,
              backgroundColor: '#f1f5f9',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 24 24' fill='none' stroke='%23e2e8f0' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M13 16a3 3 0 0 1 2.24 5'/%3E%3Cpath d='M18 12h.01'/%3E%3Cpath d='M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1.93 1.93 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3'/%3E%3Cpath d='M20 8.54V4a2 2 0 1 0-4 0v3'/%3E%3Cpath d='M7.612 12.524a3 3 0 1 0-1.6 4.3'/%3E%3C/svg%3E")`,
              backgroundSize: '120px 120px',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat',
            }}
          >
            {rabbitHoleWindows.map((window, index) => (
              <RabbitHolePopup
                key={window.id}
                window={window}
                allWindows={rabbitHoleWindows}
                isOnly={rabbitHoleWindows.length === 1}
                onClose={() => handleCloseRabbitHole(window.id)}
                onSendMessage={(content) => handleRabbitHoleSendMessage(window.id, content)}
                onContinueRabbitHole={(text, page) => handleStartRabbitHole(text, page, window.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Rabbit Hole Graph Overlay */}
      {showRabbitHoleGraph && (
        <RabbitHoleGraph
          rabbitHoleWindows={rabbitHoleWindows}
          savedRabbitHoles={savedRabbitHoles}
          onClose={() => setShowRabbitHoleGraph(false)}
          onNodeClick={handleMapNodeClick}
          learningSummary={learningSummary || undefined}
          onGenerateSummary={handleGenerateSummary}
          isSummarizing={isSummarizing}
        />
      )}

      {/* Toast notifications */}
      <Toaster position="top-right" richColors />
    </div>
  );
}
