// src/App.js
import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import ReactFlow, {
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Controls,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './App.css';
import Split from 'react-split';

function CustomNode({ data, id }) {
  const isActiveNode = data.activePathNodes.has(id);
  const isSelected = data.selected;

  const style = {
    borderColor: isSelected ? '#59e7a8' : isActiveNode ? '#da6623' : '#292929',
    background: isActiveNode ? '#1b1b1d' : "#161617",
    boxShadow: `0 0 ${isSelected ? '4px #59e7a8' : isActiveNode ? '4px #da6623' : '9px #494949'}`
  };


  return (
    <div
      className="custom-node"
      /*style={{
        borderColor: data.selected ? '#59e7a8' : isActiveNode ? '#da6623' : '#292929',
        background: isActiveNode ? '#1b1b1d' : "#161617",
        boxShadow: `0 0 ${data.selected ? '4px #59e7a8' : isActiveNode ? '4px #da6623' : '9px #494949'}`
      }}*/

      style={style}
      onDoubleClick={() => data.onNodeDoubleClick(id)}
      onClick={(e) => {
        e.stopPropagation();
        data.onNodeClick(id); 
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        data.onNodeCopy(id);
      }}
    >
      {id !== '1' && (
        <Handle 
          type="target" 
          position={Position.Left} 
          className="handle handle-target"
        />
      )}

      <div className="custom-node-header" style={{ paddingLeft: id !== "1" ? 18 : 8 }}>
        {data.title || `Нода ${id}`}

        <div className="node-actions">
          <button className="btn-icon edit"
            onClick={(e) => {
              e.stopPropagation();
              data.onEditNode(id);
            }}
            
          />

          {id !== '1' && (
            <>  
              <button className="btn-icon clone"
                onClick={(e) => {
                  e.stopPropagation();
                  if(id !== "1"){data.onCloneNode(id);}
                }}

              />
              <button className="btn-icon delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if(id !== "1"){data.onDeleteNode(id);}
                }}
              />
            </>
          )}
        </div>


      </div>
      
      <div className="custom-node-content">
        <div 
          className="custom-scroll"
          onWheel={(e) => {
            const element = e.currentTarget;
            const isScrollable = element.scrollHeight > element.clientHeight;
            
            if (isScrollable) {
              element.scrollTop += e.deltaY;
              const isAtTop = element.scrollTop === 0 && e.deltaY < 0;
              const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight && e.deltaY > 0;
              
              if (!isAtTop && !isAtBottom) {
                e.stopPropagation();
                e.preventDefault();
              }
            }
          }}
        >
          {data.content}
        </div>
        
        {data.branches.length > 1 && (
          <select
            className="branch-select"
            value={data.activeBranch || ''}
            onChange={(e) => data.onBranchChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          >
            <option disabled value="">
              Выберите ветку
            </option>
            {data.branches.map((branch) => (
              <option key={branch.id} value={branch.target}>
                {branch.title}
              </option>
            ))}
          </select>
        )}
      </div>
      <Handle 
        type="source" 
        position={Position.Right} 
        className="handle handle-source"
        isConnectable={true}
        onDoubleClick={(e) => {
          e.stopPropagation();
          data.onHandleDoubleClick(id);
        }}      
      />
    </div>
  );
}

const getActivePathEdges = (nodes, edges) => {
  const activeEdges = new Set();
  let currentNodeId = '1';
  
  while (true) {
    const node = nodes.find(n => n.id === currentNodeId);
    if (!node || !node.data.activeBranch) break;
    
    const edge = edges.find(e => 
      e.source === currentNodeId && e.target === node.data.activeBranch
    );
    
    if (edge) activeEdges.add(edge.id);
    currentNodeId = node.data.activeBranch;
  }
  
  return activeEdges;
};

const getActivePathNodes = (nodes) => {
  const activeNodes = new Set();
  let currentNodeId = '1';
  
  while (true) {
    activeNodes.add(currentNodeId);
    const node = nodes.find(n => n.id === currentNodeId);
    if (!node || !node.data.activeBranch) break;
    currentNodeId = node.data.activeBranch;
  }
  
  return activeNodes;
};

const hasPath = (nodes, edges, start, goal) => {
  const adj = edges.reduce((acc, { source, target }) => {
    if (!acc[source]) acc[source] = [];
    acc[source].push(target);
    return acc;
  }, {});
  
  const visited = new Set();
  const stack = [start];
  
  while (stack.length) {
    const nodeId = stack.pop();
    if (nodeId === goal) return true;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    const neighbors = adj[nodeId] || [];
    for (const nb of neighbors) {
      if (!visited.has(nb)) stack.push(nb);
    }
  }
  return false;
};


const nodeTypes = { custom: CustomNode };

const initialNodes = [
  {
    id: '1',
    type: 'custom',
    position: { x: 100, y: 100 },
    data: { 
      title: 'Главная нода',
      content: 'Содержание главной ноды',
      branches: [],
      activeBranch: null,
      onNodeClick: () => {},
      onBranchChange: () => {},
    },
    connectable: false
  },
];

const initialEdges = [];

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [nextId, setNextId] = useState(2);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [copiedSelection, setCopiedSelection] = useState({ nodes: [], edges: [] });
  const [editingTitle, setEditingTitle] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [editingNodeId, setEditingNodeId] = useState(null);
  
  
  const activePathEdges = useMemo(() => getActivePathEdges(nodes, edges), [nodes, edges]);
  const activePathNodes = useMemo(() => getActivePathNodes(nodes), [nodes]);

  const [edgeContextMenu, setEdgeContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    edgeId: null,
  });
  

  const edgesWithStyles = useMemo(() => 
    edges.map(edge => ({
      ...edge,
      style: {
        stroke: selectedEdgeId === edge.id ? '#595959' :  
        activePathEdges.has(edge.id) ? '#da6623' : '#353535',
        strokeWidth: 1.5,
        strokeDasharray: activePathEdges.has(edge.id) ? '0' : '5 5',
        ...(selectedEdgeId === edge.id && { 
          strokeDasharray: '6 8',
          strokeWidth: 2,
          strokeLinecap: 'round'
        })
      }
    })),
    [edges, selectedEdgeId, activePathEdges]
  );

  const handleBranchChange = useCallback((nodeId, branchId) => {
    if (hasPath(nodes, edges, branchId, nodeId)) {
      console.warn(`Переключение ветки ${nodeId} → ${branchId} образует цикл, отменяю.`);
      return;
    }
    setNodes(nds => nds.map(node => 
      node.id === nodeId ? { ...node, data: { ...node.data, activeBranch: branchId } } : node
    ));
  }, [edges, nodes, setNodes]);

  const handleNodeClick = useCallback((id) => {
    setSelectedNodeId(id);
  }, []);

  const handleHandleDoubleClick = useCallback((sourceId) => {
    const sourceNode = nodes.find(n => n.id === sourceId);
    if (!sourceNode) return;
  
    const newNodeId = nextId.toString();
    const newPosition = {
      x: sourceNode.position.x + 200,
      y: sourceNode.position.y
    };
  
    const newNode = {
      id: newNodeId,
      type: 'custom',
      position: newPosition,
      data: { 
        title: `Нода ${newNodeId}`,
        content: `Содержание ноды ${newNodeId}`,
        branches: [],
        activeBranch: null,
        onNodeClick: handleNodeClick,
        onBranchChange: (branchId) => handleBranchChange(newNodeId, branchId),
        onHandleDoubleClick: handleHandleDoubleClick,
      },
    };
    
  
    const newEdge = {
      id: `e${sourceId}-${newNodeId}`,
      source: sourceId,
      target: newNodeId,
      type: 'default',
      timestamp: Date.now(),
    };
  
    setNodes(nds => [...nds, newNode]);
    setEdges(eds => [...eds, newEdge]);
    setNextId(prev => prev + 1);
  }, [nodes, nextId, setNodes, setEdges, handleNodeClick, handleBranchChange]);


  const handleCloneNode = useCallback((nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
  
    const newId = nextId.toString();
    const newNode = {
      ...node,
      id: newId,
      position: { 
        x: node.position.x + 50, 
        y: node.position.y + 50 
      },
      data: {
        ...node.data,
        branches: [],
        activeBranch: null,
        selected: false
      }
    };
  
    setNodes(nds => [...nds, newNode]);
    setNextId(prev => prev + 1);
  }, [nodes, nextId, setNodes]);
  
  const handleNodeCopy = useCallback((nodeId) => {
    setSelectedNodeId(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    if (node) setCopiedSelection({ nodes: [node], edges: [] });
  }, [nodes]);


  
  const handleNodeDoubleClick = useCallback((id) => {
    const node = nodes.find(n => n.id === id);
    if (node) {
      setEditingNodeId(id);
      setEdgeContextMenu({ visible: false, x: 0, y: 0, edgeId: null });
      setEditingTitle(node.data.title);
      setEditingContent(node.data.content);
    }
  }, [nodes]);

  const deleteNode = useCallback((nodeId) => {
    setNodes((nds) =>
      nds
        .filter(node => node.id !== nodeId)
        .map(node => ({
          ...node,
          data: {
            ...node.data,
            activeBranch: node.data.activeBranch === nodeId ? null : node.data.activeBranch
          }
        }))
    );
    setEdges((eds) => eds.filter(edge => edge.source !== nodeId && edge.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [selectedNodeId, setEdges, setNodes]);

  const deleteEdge = useCallback((edgeId) => {
    setEdges((eds) => eds.filter(e => e.id !== edgeId));
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
  }, [selectedEdgeId, setEdges]);

  const handleDeleteNode = useCallback((nodeId) => { deleteNode(nodeId); }, [deleteNode]);  

// recompute branches once per edge‐change, not on every nodes update
useEffect(() => {
    setNodes(nds =>
      nds.map(node => {
        const branches = edges
          .filter(e => e.source === node.id)
          .sort((a, b) => a.timestamp - b.timestamp)
          .map(e => ({
            id: e.id,
            target: e.target,
            title: nds.find(n => n.id === e.target)?.data.title || `Нода ${e.target}`,
            content: nds.find(n => n.id === e.target)?.data.content || ''
          }));
  
        return {
          ...node,
          data: {
            ...node.data,
            branches,
            // if no activeBranch yet, pick the first
            activeBranch: node.data.activeBranch || branches[0]?.target || null
          }
        };
      })
    );
  }, [edges, setNodes]);
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

      if(selectedNodeId === null || selectedNodeId === "1") return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        const selNodes = nodes.filter(n => n.id === selectedNodeId);
        const selEdges = edges.filter(edge => edge.id === selectedEdgeId);
        setCopiedSelection({ nodes: selNodes, edges: selEdges });
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && copiedSelection.nodes.length) {
        e.preventDefault();
        const newIdMap = {};
        let idCounter = nextId;
        let lastNewId = null;

        setSelectedNodeId(null);
        setSelectedEdgeId(null);      

        const pastedNodes = copiedSelection.nodes.map(n => {
          const newId = String(idCounter++);
          newIdMap[n.id] = newId;
          lastNewId = newId;
          return {
            ...n,
            id: newId,
            position: { x: n.position.x + 20, y: n.position.y + 20 },
            data: {
              ...n.data,
              branches: [],
              activeBranch: null,
              selected: false 
            }
          };
        });
        
        const pastedEdges = copiedSelection.edges.map(edge => {
          const source = newIdMap[edge.source];
          const target = newIdMap[edge.target];
          return source && target
            ? { ...edge, id: `e${source}-${target}`, source, target }
            : null;
        }).filter(Boolean);

        setNodes(nds => [...nds, ...pastedNodes]);
        setEdges(eds => [...eds, ...pastedEdges]);
        setNextId(idCounter);
        if (lastNewId) setSelectedNodeId(lastNewId);
      }
      
      if (e.key === 'Delete' && selectedNodeId) {
        e.preventDefault();
        deleteNode(selectedNodeId);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, selectedNodeId, selectedEdgeId, copiedSelection, nextId, setNodes, setEdges, deleteNode]);


  const generateShareLink = useCallback(() => {
    const state = {
      nodes: nodes.map(({ id, position, data }) => ({
        id,
        position,
        data: {
          title: data.title,
          content: data.content,
          activeBranch: data.activeBranch
        }
      })),
      edges: edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target
      })),
      nextId
    };
    
    const compressed = compressToEncodedURIComponent(JSON.stringify(state));
    return `${window.location.origin}${window.location.pathname}?state=${compressed}`;
  }, [nodes, edges, nextId]);
  
  
  useEffect(() => {
    const loadState = () => {
      const params = new URLSearchParams(window.location.search);
      const compressedState = params.get('state');
      
      if (compressedState) {
        try {
          // Правильное декодирование и парсинг
          const stateStr = decompressFromEncodedURIComponent(compressedState);
          const parsedState = JSON.parse(stateStr);
  
          // Восстановление нод с обработчиками
          const restoredNodes = parsedState.nodes.map(node => ({
            ...node,
            type: 'custom',
            data: {
              ...node.data,
              branches: [],
              onNodeClick: handleNodeClick,
              onBranchChange: (branchId) => handleBranchChange(node.id, branchId),
              onHandleDoubleClick: handleHandleDoubleClick,
              onDeleteNode: handleDeleteNode,
              onCloneNode: handleCloneNode,
              onEditNode: handleNodeDoubleClick
            }
          }));
  
          // Обновление состояния приложения
          setNodes(restoredNodes);
          setEdges(parsedState.edges);
          setNextId(parsedState.nextId);
        } catch (e) {
          console.error('Ошибка загрузки сохранённого состояния:', e);
        }
      }
    };
    
    loadState();
  }, [setEdges, setNodes, handleBranchChange, handleNodeClick, handleHandleDoubleClick, handleDeleteNode, handleCloneNode, handleNodeDoubleClick]);
      

  const addNode = useCallback(() => {
    const newNode = {
      id: nextId.toString(),
      type: 'custom',
      position: { x: 100 + nextId * 50, y: 100 + nextId * 30 },
      data: { 
        title: `Нода ${nextId}`,
        content: `Содержание ноды ${nextId}`,
        branches: [],
        activeBranch: null,
        onNodeClick: (id) => handleNodeClick(id),
        onBranchChange: (branchId) => handleBranchChange(newNode.id, branchId),
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setNextId((id) => id + 1);
  });

  const updateNodeLabel = (id, newTitle, newContent) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id ? { 
          ...node, 
          data: { ...node.data, title: newTitle, content: newContent } 
        } : node
      )
    );
  };
  


  useEffect(() => {
    const handleClickOutside = (e) => {
      const editingPanel = document.querySelector('.editing-panel');
      const leftPanel = document.querySelector('.left-panel');
      const reactFlowControls = document.querySelector('.react-flow__controls');
      
      const edgeMenu = document.querySelector('.edge-context-menu');
      
      const isClickOnProtectedElement = 
      e.target.closest('.react-flow__node') ||
      e.target.closest('.react-flow__edge') ||
      editingPanel?.contains(e.target) ||
      leftPanel?.contains(e.target) ||
      reactFlowControls?.contains(e.target) ||
      e.target.closest('select') ||
      edgeMenu?.contains(e.target);

      if (edgeContextMenu.visible && !isClickOnProtectedElement) {
        setEdgeContextMenu({ visible: false, x: 0, y: 0, edgeId: null });
      }

        
      if (editingNodeId && !isClickOnProtectedElement) {
        setEditingNodeId(null);
        
      }
      
    };
    
  
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [editingNodeId]);

  const onConnect = useCallback((params) => {
    const { source, target } = params;
    
    // если уже есть путь от target обратно к source — это цикл
    if (hasPath(nodes, edges, target, source)) {
      // можно вывести алерт или просто ничего не делать
      console.warn(`Связь ${source} → ${target} образует цикл, отменяю.`);
      return;
    }
  
    const newEdge = {
      ...params,
      type: 'default',
      timestamp: Date.now(),
    };
    setEdges(eds => addEdge(newEdge, eds));
  }, [nodes, edges, setEdges]);

  
  const getFullChain = useCallback(() => {
    const getChain = (nodeId, chain = []) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return chain;
      
      chain.push(node.data.content);
      
      if (node.data.activeBranch) {
        return getChain(node.data.activeBranch, chain);
      }
      return chain;
    };

    return getChain('1').join(' ');
  }, [nodes]);

  const nodesWithHandlers = useMemo(() => 
    nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        activePathNodes,
        selected: node.id === selectedNodeId,
        onNodeCopy: id => handleNodeCopy(id),
        onNodeClick: (id) => handleNodeClick(id),
        onNodeDoubleClick: (id) => handleNodeDoubleClick(id),
        onBranchChange: (branchId) => handleBranchChange(node.id, branchId),
        onHandleDoubleClick: handleHandleDoubleClick,
        onDeleteNode: handleDeleteNode,
        onCloneNode: handleCloneNode,
        onEditNode: handleNodeDoubleClick  
        }
    }))
  , [nodes, activePathNodes, selectedNodeId, handleHandleDoubleClick, handleDeleteNode, handleCloneNode, handleNodeDoubleClick, handleNodeCopy, handleNodeClick, handleBranchChange]);

  return (
    <Split
      sizes={[25, 75]}
      minSize={150}
      gutterSize={10}
      gutterStyle={() => ({
        backgroundColor: '#000000',
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='40' viewBox='0 0 20 40'><circle cx='10' cy='8' r='2' fill='%234a4a4a'/><circle cx='10' cy='16' r='2' fill='%234a4a4a'/><circle cx='10' cy='24' r='2' fill='%234a4a4a'/><circle cx='10' cy='32' r='2' fill='%234a4a4a'/></svg>")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
    
        cursor: 'col-resize',
        width: '12px',
        margin: '0 -2px',
        borderRadius: '3px',
        transition: 'all 0.2s',
        ':hover': {
          backgroundColor: '#da6623',
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='40' viewBox='0 0 20 40'><circle cx='10' cy='8' r='2' fill='%23da6623'/><circle cx='10' cy='16' r='2' fill='%23da6623'/><circle cx='10' cy='24' r='2' fill='%23da6623'/><circle cx='10' cy='32' r='2' fill='%23da6623'/></svg>")`
        }
      })}
      className="left-panel"
      style={{ display: 'flex', height: '100vh', background: '#1b1b1d' }}

      >
    <div style={{ 
      padding: 10,
      paddingLeft: 7,
      paddingRight: 7,
      background: '#1b1b1d',
      color: '#bfbfbf',
      borderRight: '1px solid #292929'
    }}

    >
      <h3 style={{ color: '#da6623', marginBottom: 15 }}>Текущая цепочка</h3>
      <div style={{ 
        whiteSpace: 'pre-wrap', 
        border: '1px solid #292929',
        padding: 8,
        height: '80vh',
        overflowY: 'auto',
        background: '#131313',
        borderRadius: 0
      }}>
        {getFullChain()}
      </div>

    <h3 style={{ color: '#da6623', marginBottom: 15 }}>Поделиться</h3>
    <button 
      onClick={() => {
        const link = generateShareLink();
        navigator.clipboard.writeText(link);
      }}
      style={{ 
        background: '#2a2a2d',
        border: '1px solid #292929',
        color: '#bfbfbf',
        padding: '6px 15px',
        cursor: 'pointer',
        marginRight: '1%',
        //marginBottom: 10,
        width: '49%'
      }}
    >
      Скопировать ссылку
    </button>
    
    <button 
      onClick={() => {
        window.history.replaceState(null, '', window.location.pathname);
        setNodes(initialNodes);
        setEdges(initialEdges);
        setNextId(2);
      }}
      style={{ 
        background: '#2a2a2d',
        border: '1px solid #292929',
        color: '#bfbfbf',
        padding: '6px 15px',
        cursor: 'pointer',
        width: '49%'
      }}
    >
      Создать новый
    </button>

    </div>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
        <div style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodesWithHandlers}
            edges={edgesWithStyles}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={(event, edge) => {
              setSelectedEdgeId(edge.id);
              setEdgeContextMenu(prev => ({
                visible: !prev.visible || prev.edgeId !== edge.id,
                x: event.clientX,
                y: event.clientY,
                edgeId: edge.id,
              }));
            }}            
            
            onNodeDragStart={(event, node) => {
              if(selectedNodeId !== node.id){
                setSelectedNodeId(null);
              }
            }}

            onMoveStart={() => {
              setSelectedEdgeId(null);
              setEdgeContextMenu({ visible: false, x: 0, y: 0, edgeId: null });
            }}

            onPaneClick={() => {
              setSelectedEdgeId(null);
              setSelectedNodeId(null);
              setEdgeContextMenu({ visible: false, x: 0, y: 0, edgeId: null });

            }}

            snapToGrid={true}
            snapGrid={[20, 20]}


            nodeTypes={nodeTypes}
            zoomOnScroll={true}
            zoomOnPinch={true}
            panOnScroll={false} 
            panOnDrag={true}
            preventScrolling={false}
                    
            defaultEdgeOptions={{
              type: 'straight',
              style: {
                stroke: '#686868',
                strokeWidth: 1.5,
                strokeDasharray: '5 5',
              },
            }}
            proOptions={{ hideAttribution: true }} 

            fitView

            colorMode="dark"
                        
          >
            <Background gap={20} size={1.25}     color="#404040"     // Цвет линий сетки (темно-серый)
            variant="dots"      // Вариант: 'dots' для точек, 'lines' для линий
            style={{ 
              background: '#131313', // Основной фон
              mixBlendMode: 'normal' // Режим наложения
            }}
            />
            
            <Controls>
              <button 
                className="react-flow__controls-button" 
                onClick={addNode}
                title="Добавить ноду"
                style={{
                  width: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
              </button>
            </Controls>

              
          </ReactFlow>
        </div>
        
        {editingNodeId  && (
            <div 
            className="editing-panel" // ← Добавьте класс для идентификации
            style={{ 
              paddingLeft: 10,
              paddingTop: -10,
              paddingBottom: 10,
              background: '#1b1b1d', // Измененный фон
              borderTop: '3px solid #0c0c0c',
              boxShadow: '0 -10px 10px rgba(0,0,0,0.3)',
              zIndex: 10,
              color: '#bfbfbf', // Цвет текста
              position: 'absolute',
              bottom: 0,
              width: '99.1%'
            }}
          >
              <h4>Редактирование ноды {editingNodeId }</h4>
            
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Заголовок:</div>
              <input
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                style={{width: "140vh", padding: 4, fontSize: 12, background: '#1b1b1d', color: '#bfbfbf', border: '1px solid #292929'}}
              />
            </div>
            
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Содержание:</div>
              <textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                style={{width: "140vh", padding: 4, fontSize: 12, minHeight: 135, background: '#1b1b1d', color: '#bfbfbf', border: '1px solid #292929'}}
              />
            </div>

            <button
              onClick={() => {
                updateNodeLabel(editingNodeId, editingTitle, editingContent);
                setEditingNodeId(null); 
              }}
              style={{ 
                background: '#da6623',
                color: '#0000000',
                border: '1px solid #c45a1f',
                padding: '6px 12px',
                borderRadius: 4,
                cursor: 'pointer'
              }}
        
            >
              Сохранить
            </button>
          </div>
        )}
        
      </div>

      {edgeContextMenu.visible && (
      <div
        className="edge-context-menu"
        style={{
          position: 'fixed',
          left: edgeContextMenu.x,
          top: edgeContextMenu.y,
          background: '#2a2a2d',
          border: '1px solid #292929',
          borderRadius: 4,
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        <button
          onClick={() => {
            deleteEdge(edgeContextMenu.edgeId);
            setEdgeContextMenu({ visible: false, x: 0, y: 0, edgeId: null });
          }}
          style={{
            width: '100%',
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            color: '#bfbfbf',
            cursor: 'pointer',
            textAlign: 'left',
            ':hover': {
              background: '#da6623',
              color: '#fff',
            },
          }}
        >
          Удалить связь
        </button>
      </div>
    )}

    </Split>
  );
}

export default App;