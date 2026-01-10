import React, { useState } from 'react';
import { FileText, Plus, Trash2, FolderOpen } from 'lucide-react';

export interface Project {
  id: string;
  name: string;
  pdfFile: string;
  pdfName: string;
  createdAt: Date;
  lastModified: Date;
  rabbitHolesCount: number;
}

interface ProjectSelectorProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onCreateProject: (file: File) => void;
  onDeleteProject: (projectId: string) => void;
}

export function ProjectSelector({
  projects,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}: ProjectSelectorProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      onCreateProject(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      onCreateProject(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <div className="min-h-screen bg-[#f9f9f9] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-8 py-8">
          <h1 className="text-4xl font-serif font-bold text-slate-800 mb-2">
            Rabbit Hole
          </h1>
          <p className="text-slate-600">
            Dive deep into any concept
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-5xl mx-auto px-8 py-12 w-full">
        {/* Upload Area */}
        <div
          className={`relative border-2 border-dashed rounded-lg p-12 mb-12 transition-all ${
            isDragging
              ? 'border-slate-800 bg-slate-50'
              : 'border-slate-300 bg-white hover:border-slate-400'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
              <Plus className="w-8 h-8 text-slate-600" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-serif font-bold text-slate-800 mb-2">
              Start a New Project
            </h3>
            <p className="text-slate-600 mb-6">
              Upload a PDF to begin your research session
            </p>
            <label className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-md hover:bg-slate-700 transition-colors cursor-pointer">
              <FolderOpen className="w-4 h-4" strokeWidth={2} />
              Choose PDF File
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            <p className="text-sm text-slate-500 mt-4">
              or drag and drop a PDF file here
            </p>
          </div>
        </div>

        {/* Recent Projects */}
        {projects.length > 0 && (
          <div>
            <h2 className="text-2xl font-serif font-bold text-slate-800 mb-6">
              Recent Projects
            </h2>
            <div className="grid gap-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group bg-white border border-slate-200 rounded-lg p-6 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => onSelectProject(project)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-slate-100 flex-shrink-0">
                        <FileText className="w-6 h-6 text-slate-600" strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-medium text-slate-800 mb-1 truncate">
                          {project.name}
                        </h3>
                        <p className="text-sm text-slate-500 mb-2">{project.pdfName}</p>
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                          <span>
                            Modified {new Date(project.lastModified).toLocaleDateString()}
                          </span>
                          <span>•</span>
                          <span>{project.rabbitHolesCount} rabbit holes</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProject(project.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-600 transition-all"
                      title="Delete project"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
