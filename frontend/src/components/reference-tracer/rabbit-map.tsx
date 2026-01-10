import React from 'react';
import { Rabbit, X, BookOpen } from 'lucide-react';

export interface ReferenceNode {
  id: string;              // Rabbit hole window ID
  citationKey: string;     // "[1]", "[5]", etc.
  title: string;           // Reference paper title
  pageNumber: number;      // Page where citation was clicked
}

interface RabbitMapProps {
  nodes: ReferenceNode[];
  activeNodeId?: string;   // Currently focused rabbit hole
  onSelectNode: (nodeId: string) => void;
  onCloseNode: (nodeId: string) => void;
}

export function RabbitMap({ nodes, activeNodeId, onSelectNode, onCloseNode }: RabbitMapProps) {
  if (nodes.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 bg-slate-800 text-white flex items-center gap-2">
        <Rabbit className="w-4 h-4" strokeWidth={1.5} />
        <h3 className="text-sm font-medium">Reference Rabbit Holes</h3>
        <span className="text-xs bg-slate-700 px-1.5 py-0.5 rounded ml-auto">
          {nodes.length}
        </span>
      </div>

      {/* Node list */}
      <div className="max-h-64 overflow-y-auto">
        {nodes.map((node) => (
          <div
            key={node.id}
            className={`
              flex items-start gap-2 px-3 py-2 cursor-pointer group border-b border-slate-100 last:border-b-0
              transition-colors
              ${activeNodeId === node.id
                ? 'bg-emerald-50'
                : 'hover:bg-slate-50'}
            `}
            onClick={() => onSelectNode(node.id)}
          >
            <BookOpen className={`w-4 h-4 mt-0.5 flex-shrink-0 ${activeNodeId === node.id ? 'text-emerald-600' : 'text-slate-400'}`} strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-blue-600 flex-shrink-0">
                  {node.citationKey}
                </span>
                <span className="text-xs text-slate-400">
                  p.{node.pageNumber}
                </span>
              </div>
              <p className="text-sm text-slate-700 truncate" title={node.title}>
                {node.title}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseNode(node.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded transition-opacity flex-shrink-0"
              title="Close rabbit hole"
            >
              <X className="w-3 h-3 text-slate-500" strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 bg-slate-50 border-t border-slate-100">
        <p className="text-xs text-slate-500">
          Right-click citations in PDF to add more
        </p>
      </div>
    </div>
  );
}
