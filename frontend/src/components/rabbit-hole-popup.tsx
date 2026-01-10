import React, { useState, useRef, useEffect } from 'react';
import { X, Minus, Maximize2, Send, Hash, Rabbit, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { RabbitHoleWindow, Message } from '../App';
import { ContextMenu } from './context-menu';

interface RabbitHolePopupProps {
  window: RabbitHoleWindow;
  allWindows: RabbitHoleWindow[];
  isOnly?: boolean;
  onClose: () => void;
  onSendMessage: (content: string) => void;
  onContinueRabbitHole: (selectedText: string, pageReference: number) => void;
}

export function RabbitHolePopup({
  window: rabbitHoleWindow,
  allWindows,
  isOnly = false,
  onClose,
  onSendMessage,
  onContinueRabbitHole,
}: RabbitHolePopupProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selectedText: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rabbitHoleWindow.messages]);

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text) {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        selectedText: text,
      });
    }
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleContinueRabbitHole = () => {
    if (contextMenu) {
      onContinueRabbitHole(contextMenu.selectedText, rabbitHoleWindow.pageReference);
      setContextMenu(null);
    }
  };

  // Build breadcrumb path
  const buildBreadcrumbs = (): RabbitHoleWindow[] => {
    const path: RabbitHoleWindow[] = [];
    let current: RabbitHoleWindow | undefined = rabbitHoleWindow;

    while (current) {
      path.unshift(current);
      current = current.parentId ? allWindows.find(w => w.id === current!.parentId) : undefined;
    }

    return path;
  };

  const breadcrumbs = buildBreadcrumbs();

  // Only expand to fill space if this is the only window and not minimized
  // Multiple windows get a fixed height to allow scrolling
  const shouldFillHeight = isOnly && !isMinimized;

  return (
    <div
      className={`flex flex-col bg-white overflow-hidden border-b border-slate-200 ${shouldFillHeight ? 'flex-1 min-h-0' : 'flex-shrink-0'}`}
      style={!isMinimized && !isOnly ? { height: 450 } : undefined}
    >
      {/* Header */}
      <div className="bg-slate-800 text-white px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Rabbit className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate" title={rabbitHoleWindow.selectedText}>
                {rabbitHoleWindow.topic}
              </div>
              <div className="text-xs opacity-75">
                Page {rabbitHoleWindow.pageReference} · Depth {rabbitHoleWindow.depth}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              title={isMinimized ? 'Maximize' : 'Minimize'}
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Minus className="w-3.5 h-3.5" strokeWidth={1.5} />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              title="Close (saves as comment)"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Breadcrumbs */}
        {!isMinimized && breadcrumbs.length > 1 && (
          <div className="flex items-center gap-1 text-xs overflow-x-auto pb-1">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.id}>
                <span className="bg-slate-700 px-2 py-0.5 rounded whitespace-nowrap">
                  {crumb.topic}
                </span>
                {index < breadcrumbs.length - 1 && (
                  <ChevronRight className="w-3 h-3 flex-shrink-0" strokeWidth={1.5} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {!isMinimized && (
        <>
          {/* Messages - Scrollable */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f9f9f9] min-h-0"
            onContextMenu={handleContextMenu}
          >
            {(rabbitHoleWindow.messages || []).map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    message.role === 'user'
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-800 border border-slate-200'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <div className="text-sm leading-relaxed markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed">
                      {message.imageDataUrl && (
                        <div className="mb-2 rounded overflow-hidden border border-slate-600">
                          <img
                            src={message.imageDataUrl}
                            alt="Figure"
                            className="max-w-full h-auto max-h-32 object-contain bg-white"
                          />
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    </div>
                  )}
                  {message.pageReference && (
                    <div className="flex items-center gap-1 mt-1.5 text-xs opacity-60">
                      <Hash className="w-3 h-3" strokeWidth={1.5} />
                      Page {message.pageReference}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {/* Loading indicator for streaming */}
            {rabbitHoleWindow.messages.length > 0 &&
              rabbitHoleWindow.messages[rabbitHoleWindow.messages.length - 1]?.role === 'assistant' &&
              rabbitHoleWindow.messages[rabbitHoleWindow.messages.length - 1]?.content === '' && (
              <div className="flex justify-start">
                <div className="bg-white text-slate-800 border border-slate-200 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                    <span>Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Hint */}
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex-shrink-0">
            <div className="text-xs text-slate-600">
              💡 Select text and right-click to continue exploring
            </div>
          </div>

          {/* Input Area */}
          <div className="p-3 border-t border-slate-200 bg-white flex-shrink-0">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a follow-up question..."
                className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent resize-none text-sm"
                rows={2}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="px-3 py-2 bg-slate-800 text-white rounded-md hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
              >
                <Send className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Context Menu */}
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              selectedText={contextMenu.selectedText}
              onStartRabbitHole={handleContinueRabbitHole}
              onClose={handleCloseContextMenu}
              isInPopup={true}
              onContinueRabbitHole={handleContinueRabbitHole}
            />
          )}
        </>
      )}
    </div>
  );
}
