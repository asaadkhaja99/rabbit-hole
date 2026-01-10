import React, { useState, useRef } from 'react';
import { X, Send } from 'lucide-react';

export interface EquationAnnotation {
  id: string;
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  pageNumber: number;
  question: string;
  imageDataUrl?: string;
}

interface EquationAnnotationOverlayProps {
  annotation: EquationAnnotation;
  onRemove: (id: string) => void;
  onSubmit: (id: string, question: string, imageDataUrl: string) => void;
  scale: number;
}

export function EquationAnnotationOverlay({
  annotation,
  onRemove,
  onSubmit,
  scale,
}: EquationAnnotationOverlayProps) {
  const [question, setQuestion] = useState(annotation.question);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!question.trim() || !annotation.imageDataUrl) return;
    onSubmit(annotation.id, question.trim(), annotation.imageDataUrl);
    onRemove(annotation.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      onRemove(annotation.id);
    }
  };

  return (
    <>
      {/* Translucent blue rectangle */}
      <div
        className="absolute border-blue-600 bg-blue-400/50 pointer-events-none"
        style={{
          left: annotation.bounds.left * scale,
          top: annotation.bounds.top * scale,
          width: annotation.bounds.width * scale,
          height: annotation.bounds.height * scale,
          borderWidth: '3px',
        }}
      />

      {/* Input box positioned below the rectangle */}
      <div
        className="absolute bg-white rounded-lg shadow-xl border border-blue-300 flex items-center gap-2 p-2 z-50"
        style={{
          left: annotation.bounds.left * scale,
          top: (annotation.bounds.top + annotation.bounds.height) * scale + 8,
          minWidth: Math.max(300, annotation.bounds.width * scale),
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want to know about this equation?"
          className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
          autoFocus
        />
        <button
          onClick={handleSubmit}
          disabled={!question.trim()}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Submit question"
        >
          <Send className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => onRemove(annotation.id)}
          className="px-2 py-1.5 text-slate-500 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
          title="Cancel"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </>
  );
}
