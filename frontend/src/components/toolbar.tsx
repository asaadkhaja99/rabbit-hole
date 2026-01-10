import React, { useRef, useState, useEffect } from 'react';
import { ArrowLeft, FileText, Layers, Rabbit, GitBranch, ZoomIn, ZoomOut } from 'lucide-react';

interface ToolbarProps {
  pdfFile: string | null;
  projectName?: string;
  onFileUpload: (file: File) => void;
  onToggleRabbitHoleGraph: () => void;
  onBackToProjects?: () => void;
  onProjectNameChange?: (newName: string) => void;
  showGraph: boolean;
  activeRabbitHoles: number;
  savedRabbitHolesCount: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  zoomLevel?: number;
}

export function Toolbar({
  pdfFile,
  projectName,
  onFileUpload,
  onToggleRabbitHoleGraph,
  onBackToProjects,
  onProjectNameChange,
  showGraph,
  activeRabbitHoles,
  savedRabbitHolesCount,
  onZoomIn,
  onZoomOut,
  zoomLevel = 1,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(projectName || '');

  useEffect(() => {
    setEditedName(projectName || '');
  }, [projectName]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      onFileUpload(file);
    }
  };

  const handleNameClick = () => {
    if (onProjectNameChange) {
      setIsEditingName(true);
    }
  };

  const handleNameSave = () => {
    const trimmedName = editedName.trim();
    if (trimmedName && trimmedName !== projectName) {
      onProjectNameChange?.(trimmedName);
    } else {
      setEditedName(projectName || '');
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      setEditedName(projectName || '');
      setIsEditingName(false);
    }
  };

  return (
    <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
      {/* Left section */}
      <div className="flex items-center gap-4 flex-1">
        {onBackToProjects && (
          <button
            onClick={onBackToProjects}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
            title="Back to projects"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
          </button>
        )}

        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-slate-700" strokeWidth={1.5} />
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={handleNameKeyDown}
              className="font-serif font-bold text-slate-800 text-lg bg-transparent border-b-2 border-purple-500 outline-none px-1 min-w-[100px]"
            />
          ) : (
            <h1
              onClick={handleNameClick}
              className={`font-serif font-bold text-slate-800 text-lg ${onProjectNameChange ? 'cursor-pointer hover:text-purple-600 transition-colors' : ''}`}
              title={onProjectNameChange ? 'Click to rename' : undefined}
            >
              {projectName || 'Rabbit Hole'}
            </h1>
          )}
        </div>

        {pdfFile && activeRabbitHoles > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm ml-4">
            <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{activeRabbitHoles}</span>
          </div>
        )}
      </div>

      {/* Center section - Zoom controls */}
      {pdfFile && (
        <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-2 py-1">
          <button
            onClick={onZoomOut}
            className="p-1.5 rounded hover:bg-slate-200 transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4 text-slate-600" strokeWidth={1.5} />
          </button>
          <span className="text-sm text-slate-600 font-medium min-w-[3rem] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={onZoomIn}
            className="p-1.5 rounded hover:bg-slate-200 transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4 text-slate-600" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Right section */}
      <div className="flex items-center gap-3 flex-1 justify-end">
        {pdfFile && (
          <>
            {savedRabbitHolesCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">
                <Rabbit className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>{savedRabbitHolesCount}</span>
              </div>
            )}
            <button
              onClick={onToggleRabbitHoleGraph}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm ${
                showGraph
                  ? 'bg-purple-600 text-white'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
              title="View rabbit hole map"
            >
              <GitBranch className="w-4 h-4" strokeWidth={1.5} />
              Map
            </button>
          </>
        )}
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}