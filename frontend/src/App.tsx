import React, { useState, useEffect, useCallback } from 'react';
import { Toolbar } from './components/toolbar';
import { PdfViewer } from './components/pdf-viewer';
import { RabbitHolePopup } from './components/rabbit-hole-popup';
import { RabbitHoleGraph } from './components/rabbit-hole-graph';
import { ProjectSelector, Project } from './components/project-selector';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { uploadPdf } from './api';
import type { Highlight, GhostHighlight, ScaledPosition } from 'react-pdf-highlighter-extended';

// IndexedDB helpers for storing PDF files
const DB_NAME = 'RabbitHolePDFs';
const DB_VERSION = 1;
const STORE_NAME = 'pdfs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
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
  };

  const generateMockResponse = (question: string): string => {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('method') || lowerQuestion.includes('approach')) {
      return "The methodology section outlines a systematic approach combining quantitative and qualitative analysis. The authors employ a mixed-methods design that allows for triangulation of findings. Key techniques include statistical modeling, case study analysis, and comparative evaluation. This approach is particularly well-suited for addressing the research questions because it captures both breadth and depth of the phenomenon under investigation.";
    }
    
    if (lowerQuestion.includes('result') || lowerQuestion.includes('finding')) {
      return "The key findings indicate significant correlations between the variables studied. The results section presents empirical evidence that supports the main hypothesis while also revealing unexpected patterns in the data. Notable outcomes include improved performance metrics, validation of the theoretical framework, and identification of boundary conditions that affect the generalizability of findings.";
    }
    
    if (lowerQuestion.includes('limit') || lowerQuestion.includes('weakness')) {
      return "The authors acknowledge several limitations including sample size constraints, potential selection bias, and the cross-sectional nature of the study. External validity may be limited due to the specific context examined. Future research could address these limitations through longitudinal designs, larger sample sizes, and replication in diverse settings. Additionally, unmeasured confounding variables may influence the observed relationships.";
    }
    
    if (lowerQuestion.includes('contribution') || lowerQuestion.includes('importance')) {
      return "This work makes several significant contributions to the field. First, it extends existing theory by introducing novel conceptual frameworks. Second, it provides empirical evidence that challenges conventional wisdom. Third, it offers practical implications for practitioners and policymakers. The research fills important gaps in the literature and opens new avenues for future investigation.";
    }
    
    if (lowerQuestion.includes('compare') || lowerQuestion.includes('differ')) {
      return "Compared to previous work, this study distinguishes itself through its unique methodological approach and expanded scope. While earlier research focused on isolated aspects, this paper provides a more holistic perspective. The findings both corroborate and extend prior results, offering nuanced insights that reconcile apparent contradictions in the literature.";
    }
    
    return "That's an interesting question about the paper. Based on the content, I can help you understand this concept better. The document discusses this in relation to the broader theoretical framework and empirical findings. Could you point me to a specific section or page where you'd like me to focus my analysis?";
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

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
      pageReference: window.pageReference,
    };

    // Update window state
    setRabbitHoleWindows(prev =>
      prev.map(w =>
        w.id === windowId
          ? { ...w, messages: [...w.messages, userMessage] }
          : w
      )
    );

    // Also update saved comment
    setSavedRabbitHoles(prev =>
      prev.map(c =>
        c.id === windowId
          ? { ...c, messages: [...c.messages, userMessage] }
          : c
      )
    );

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: generateMockResponse(content),
        timestamp: new Date(),
        pageReference: window.pageReference,
      };

      // Update window state
      setRabbitHoleWindows(prev =>
        prev.map(w =>
          w.id === windowId
            ? { ...w, messages: [...w.messages, aiMessage] }
            : w
        )
      );

      // Also update saved comment
      setSavedRabbitHoles(prev =>
        prev.map(c =>
          c.id === windowId
            ? { ...c, messages: [...c.messages, aiMessage] }
            : c
        )
      );
    }, 1000);
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
            savedRabbitHoles={savedRabbitHoles}
            onDeleteRabbitHole={handleDeleteRabbitHole}
            onReopenRabbitHole={handleReopenRabbitHole}
            activeRabbitHoles={rabbitHoleWindows}
            zoomLevel={zoomLevel}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            scrollToHighlightId={scrollToHighlightId}
            onScrollComplete={() => setScrollToHighlightId(null)}
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
        />
      )}

      {/* Toast notifications */}
      <Toaster position="top-right" richColors />
    </div>
  );
}