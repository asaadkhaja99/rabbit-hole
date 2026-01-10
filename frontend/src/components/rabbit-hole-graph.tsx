import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  Background,
  Controls,
  type Node,
  type Edge,
} from '@xyflow/react';
import { X, Rabbit, FileText } from 'lucide-react';
import { RabbitHoleWindow, SavedRabbitHole } from '../App';
import '@xyflow/react/dist/style.css';

interface RabbitHoleGraphProps {
  rabbitHoleWindows: RabbitHoleWindow[];
  savedRabbitHoles: SavedRabbitHole[];
  onClose: () => void;
  onNodeClick?: (nodeId: string) => void;
}

// Custom node for rabbit holes (active)
function RabbitHoleNode({ data }: { data: { label: string; depth: number; pageReference: number } }) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '12px',
        backgroundColor: '#9333ea',
        color: 'white',
        minWidth: '160px',
        maxWidth: '200px',
        boxShadow: '0 0 20px 6px rgba(147, 51, 234, 0.6), 0 0 40px 12px rgba(147, 51, 234, 0.3)',
        border: '2px solid #c084fc',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#fff', width: 8, height: 8, visibility: 'hidden' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '11px', opacity: 0.8 }}>
        <Rabbit style={{ width: 14, height: 14 }} />
        <span>Depth {data.depth}</span>
      </div>

      <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.3 }}>
        {data.label}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', opacity: 0.7 }}>
        {data.pageReference ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FileText style={{ width: 12, height: 12 }} />
            Page {data.pageReference}
          </div>
        ) : <div />}
        <div>Depth {data.depth}</div>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: '#fff', width: 8, height: 8, visibility: 'hidden' }} />
    </div>
  );
}

// Custom node for saved comments (closed rabbit holes)
function CommentNode({ data }: { data: { label: string; pageReference: number; depth: number } }) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '12px',
        backgroundColor: '#22c55e',
        color: 'white',
        minWidth: '160px',
        maxWidth: '200px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        border: '2px solid #86efac',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#fff', width: 8, height: 8, visibility: 'hidden' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '11px', opacity: 0.8 }}>
        <FileText style={{ width: 14, height: 14 }} />
        <span>Saved</span>
      </div>

      <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.3 }}>
        {data.label}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', opacity: 0.7 }}>
        {data.pageReference ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Page {data.pageReference}
          </div>
        ) : <div />}
        <div>Depth {data.depth}</div>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: '#fff', width: 8, height: 8, visibility: 'hidden' }} />
    </div>
  );
}

// Root node (depth 0)
function RootNode({ data }: { data: { label: string; depth: number; pageReference: number; isActive?: boolean; rootNumber?: number } }) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
        color: 'white',
        minWidth: '160px',
        maxWidth: '200px',
        boxShadow: data.isActive
          ? '0 0 20px 6px rgba(147, 51, 234, 0.6), 0 0 40px 12px rgba(147, 51, 234, 0.3)'
          : '0 4px 12px rgba(0, 0, 0, 0.2)',
        border: data.isActive ? '2px solid #9333ea' : '2px solid #64748b',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#fff', width: 8, height: 8, visibility: 'hidden' }} />

      {/* Rabbit Hole Number Header */}
      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', color: data.isActive ? '#c084fc' : '#94a3b8' }}>
        Rabbit Hole #{data.rootNumber || 1}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '11px', opacity: 0.8 }}>
        <Rabbit style={{ width: 14, height: 14 }} />
        <span>{data.isActive ? 'Active' : 'Saved'}</span>
      </div>

      <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.3 }}>
        {data.label}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', opacity: 0.7 }}>
        {data.pageReference && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FileText style={{ width: 12, height: 12 }} />
            Page {data.pageReference}
          </div>
        )}
        <div>Depth 0</div>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: '#fff', width: 10, height: 10, visibility: 'hidden' }} />
    </div>
  );
}

const nodeTypes = {
  rabbitHole: RabbitHoleNode,
  comment: CommentNode,
  root: RootNode,
};

// Simple tree layout algorithm - supports multiple root nodes
function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  // Build adjacency map (parent -> children)
  const children: Record<string, string[]> = {};
  const hasParent = new Set<string>();

  edges.forEach(edge => {
    if (!children[edge.source]) children[edge.source] = [];
    children[edge.source].push(edge.target);
    hasParent.add(edge.target);
  });

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Find all root nodes (nodes with no parent = depth 0)
  const rootNodes = nodes.filter(n => !hasParent.has(n.id));

  if (rootNodes.length === 0) {
    // Fallback: just position nodes in a grid
    return nodes.map((node, i) => ({
      ...node,
      position: { x: (i % 4) * 260, y: Math.floor(i / 4) * 150 },
    }));
  }

  const positioned: Node[] = [];
  const visited = new Set<string>();

  // BFS from all roots
  const levels: string[][] = [];
  let queue = rootNodes.map(n => n.id);

  while (queue.length > 0) {
    levels.push([...queue]);
    const nextQueue: string[] = [];
    for (const nodeId of queue) {
      visited.add(nodeId);
      const childIds = children[nodeId] || [];
      for (const childId of childIds) {
        if (!visited.has(childId)) {
          nextQueue.push(childId);
          visited.add(childId); // Mark visited to avoid duplicates
        }
      }
    }
    queue = nextQueue;
  }

  // Position nodes by level
  const nodeWidth = 220;
  const nodeHeight = 130;
  const horizontalGap = 40;
  const verticalGap = 80;

  levels.forEach((level, levelIndex) => {
    const totalWidth = level.length * nodeWidth + (level.length - 1) * horizontalGap;
    const startX = -totalWidth / 2;

    level.forEach((nodeId, nodeIndex) => {
      const node = nodeMap.get(nodeId);
      if (node) {
        positioned.push({
          ...node,
          position: {
            x: startX + nodeIndex * (nodeWidth + horizontalGap),
            y: levelIndex * (nodeHeight + verticalGap),
          },
        });
      }
    });
  });

  return positioned;
}

export function RabbitHoleGraph({
  rabbitHoleWindows,
  savedRabbitHoles,
  onClose,
  onNodeClick,
}: RabbitHoleGraphProps) {
  // Build initial nodes and edges
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Build a set of active (open) rabbit hole IDs
    const activeIds = new Set(rabbitHoleWindows.map(rh => rh.id));

    // Create nodes from savedRabbitHoles only (everything is saved now)
    // Check if each rabbit hole is currently active (open in sidebar)
    // Count root nodes for numbering
    let rootCounter = 0;
    savedRabbitHoles.forEach(rabbitHole => {
      const isRoot = rabbitHole.depth === 0;
      const isActive = activeIds.has(rabbitHole.id);

      if (isRoot) {
        rootCounter++;
      }

      nodes.push({
        id: rabbitHole.id,
        type: isRoot ? 'root' : (isActive ? 'rabbitHole' : 'comment'),
        position: { x: 0, y: 0 },
        data: {
          label: rabbitHole.selectedText.substring(0, 50) + (rabbitHole.selectedText.length > 50 ? '...' : ''),
          depth: rabbitHole.depth,
          pageReference: rabbitHole.pageReference,
          isActive,
          ...(isRoot && { rootNumber: rootCounter }),
        },
      });
    });

    // Create edges based on parent relationships
    savedRabbitHoles.forEach(rabbitHole => {
      if (rabbitHole.depth > 0 && rabbitHole.parentId) {
        // Check if parent exists
        const parentExists = savedRabbitHoles.some(rh => rh.id === rabbitHole.parentId);
        if (parentExists) {
          const isActive = activeIds.has(rabbitHole.id);
          edges.push({
            id: `e-${rabbitHole.parentId}-${rabbitHole.id}`,
            source: rabbitHole.parentId,
            target: rabbitHole.id,
            type: 'smoothstep',
            animated: isActive,
            style: { stroke: isActive ? '#9333ea' : '#22c55e', strokeWidth: 2 },
          });
        }
      }
    });

    // Apply layout
    const layoutedNodes = layoutNodes(nodes, edges);

    return { initialNodes: layoutedNodes, initialEdges: edges };
  }, [rabbitHoleWindows, savedRabbitHoles]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update when data changes
  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (onNodeClick) {
      // All nodes are rabbit holes now, just pass the ID
      onNodeClick(node.id);
    }
  }, [onNodeClick]);

  const totalItems = rabbitHoleWindows.length + savedRabbitHoles.length;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '90vw',
          height: '85vh',
          backgroundColor: '#f8fafc',
          borderRadius: '16px',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Rabbit style={{ width: 24, height: 24, color: '#9333ea' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', margin: 0 }}>
              Rabbit Hole Map
            </h2>
            <span style={{ fontSize: '14px', color: '#64748b', backgroundColor: '#f1f5f9', padding: '4px 12px', borderRadius: '20px' }}>
              {rabbitHoleWindows.length} active · {savedRabbitHoles.length} saved
            </span>
          </div>

          <button
            onClick={onClose}
            style={{ padding: '8px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <X style={{ width: 20, height: 20, color: '#64748b' }} />
          </button>
        </div>

        {/* Graph container - MUST have explicit height */}
        <div style={{ flex: 1, minHeight: 0, height: '100%', position: 'relative' }}>
          {totalItems === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
              <Rabbit style={{ width: 64, height: 64, marginBottom: 16, opacity: 0.5 }} />
              <p style={{ fontSize: 18, margin: 0 }}>No rabbit holes yet</p>
              <p style={{ fontSize: 14, marginTop: 8 }}>Select text in the PDF to start exploring</p>
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%' }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                fitView
                fitViewOptions={{ padding: 0.3 }}
                minZoom={0.2}
                maxZoom={2}
                defaultEdgeOptions={{
                  type: 'smoothstep',
                }}
                nodesConnectable={false}
                nodesDraggable={false}
                elementsSelectable={false}
                panOnDrag={true}
                zoomOnScroll={true}
              >
                <Background color="#cbd5e1" gap={20} />
                <Controls />
              </ReactFlow>
            </div>
          )}
        </div>

        {/* Legend */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            fontSize: '14px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: '#334155' }} />
            <span style={{ color: '#475569' }}>Depth 0 (root)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: '#9333ea' }} />
            <span style={{ color: '#475569' }}>Active</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: '#22c55e' }} />
            <span style={{ color: '#475569' }}>Saved</span>
          </div>
          <div style={{ color: '#94a3b8' }}>
            Click a node to navigate
          </div>
        </div>
      </div>
    </div>
  );
}
