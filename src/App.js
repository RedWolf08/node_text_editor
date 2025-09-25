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

function ConnectionPoint({ data, id }) {
  const isSelected = data.selected;
  
  return (
    <div
      className={`connection-point ${isSelected ? 'selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        data.onConnectionPointClick(id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        data.onConnectionPointDelete(id);
      }}
      title="Точка соединения - клик для выбора, ПКМ для удаления"
    >
      <Handle 
        type="target" 
        position={Position.Left} 
        className="handle handle-target"
        isConnectable={true}
      />
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

function CustomNode({ data, id }) {
  const isActiveNode = data.activePathNodes.has(id);
  const isSelected = data.selected;

  const style = {
    borderColor: isSelected ? '#59e7a8' : isActiveNode ? '#d1462f' : '#292929',
    background: isActiveNode ? '#1b1b1d' : "#161617",
    boxShadow: `0 0 ${isSelected ? '4px #59e7a8' : isActiveNode ? '4px #d1462f' : '9px #494949'}`
  };


  return (
    <div
      className="custom-node"
      /*style={{
        borderColor: data.selected ? '#59e7a8' : isActiveNode ? '#d1462f' : '#292929',
        background: isActiveNode ? '#1b1b1d' : "#161617",
        boxShadow: `0 0 ${data.selected ? '4px #59e7a8' : isActiveNode ? '4px #d1462f' : '9px #494949'}`
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
            title="Редактировать ноду"
          />

          {id !== '1' && (
            <>  
              <button className="btn-icon clone"
                onClick={(e) => {
                  e.stopPropagation();
                  if(id !== "1"){data.onCloneNode(id);}
                }}
                title="Клонировать ноду"
              />
              <button className="btn-icon delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if(id !== "1"){data.onDeleteNode(id);}
                }}
                title="Удалить ноду"
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
          dangerouslySetInnerHTML={{ __html: data.createRainbowText(data.content) }}
        />
        
        <select
          className={`branch-select ${data.branches.length > 1 ? 'show' : ''}`}
          value={data.activeBranch || ''}
          onChange={(e) => data.onBranchChange(id, e.target.value)}
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

const getActivePathNodes = (nodes, edges) => {
  const activeNodes = new Set();
  let currentNodeId = '1';
  
  while (true) {
    activeNodes.add(currentNodeId);
    const node = nodes.find(n => n.id === currentNodeId);
    if (!node || !node.data.activeBranch) break;
    
    // Проверяем, есть ли точка соединения между текущей нодой и следующей
    const connectionPointEdge = edges.find(e => 
      e.source === currentNodeId && 
      nodes.find(n => n.id === e.target)?.type === 'connectionPoint'
    );
    
    if (connectionPointEdge) {
      const connectionPointId = connectionPointEdge.target;
      activeNodes.add(connectionPointId);
      
      // Проверяем, что есть физическое соединение от точки соединения к активной ветке
      const nextEdge = edges.find(e => 
        e.source === connectionPointId && 
        e.target === node.data.activeBranch
      );
      
      if (nextEdge) {
        // Добавляем только целевую ноду, если соединение существует
        activeNodes.add(node.data.activeBranch);
        currentNodeId = node.data.activeBranch;
      } else {
        // Если нет физического соединения, но activeBranch указывает на существующую ноду,
        // добавляем её в активные (для случая когда связи удалены, но activeBranch не обновлен)
        const targetNode = nodes.find(n => n.id === node.data.activeBranch);
        if (targetNode) {
          activeNodes.add(node.data.activeBranch);
        }
        break;
      }
    } else {
      // Обычное соединение напрямую - проверяем, что ребро действительно существует
      const edge = edges.find(e => 
        e.source === currentNodeId && e.target === node.data.activeBranch
      );
      
      if (edge) {
        activeNodes.add(node.data.activeBranch);
        currentNodeId = node.data.activeBranch;
      } else {
        // Если нет физического соединения, но activeBranch указывает на существующую ноду,
        // добавляем её в активные (для случая когда связи удалены, но activeBranch не обновлен)
        const targetNode = nodes.find(n => n.id === node.data.activeBranch);
        if (targetNode) {
          activeNodes.add(node.data.activeBranch);
        }
        break;
      }
    }
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


const nodeTypes = { 
  custom: CustomNode,
  connectionPoint: ConnectionPoint 
};

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
  const [connectionPoints, setConnectionPoints] = useState([]);
  const [nextConnectionPointId, setNextConnectionPointId] = useState(1);
  
  
  const activePathEdges = useMemo(() => getActivePathEdges(nodes, edges), [nodes, edges]);
  const activePathNodes = useMemo(() => getActivePathNodes(nodes, edges), [nodes, edges]);

  const [edgeContextMenu, setEdgeContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    edgeId: null,
  });
  

  const edgesWithStyles = useMemo(() => 
    edges.map(edge => {
      const isConnectionPointEdge = nodes.find(n => n.id === edge.source)?.type === 'connectionPoint' ||
                                   nodes.find(n => n.id === edge.target)?.type === 'connectionPoint';
      
      return {
        ...edge,
        type: isConnectionPointEdge ? 'smoothstep' : 'bezier',
        style: {
          stroke: selectedEdgeId === edge.id ? '#59e7a8' :  
          activePathEdges.has(edge.id) ? '#d1462f' : 
          isConnectionPointEdge ? '#d1462f' : '#555555',
          strokeWidth: isConnectionPointEdge ? 2.5 : 1.5,
          strokeDasharray: activePathEdges.has(edge.id) ? '0' : '5 5',
          ...(selectedEdgeId === edge.id && { 
            strokeDasharray: '6 8',
            strokeWidth: 3,
            strokeLinecap: 'round'
          }),
          ...(isConnectionPointEdge && {
            filter: 'drop-shadow(0 0 3px rgba(209, 70, 47, 0.3))'
          })
        }
      };
    }),
    [edges, selectedEdgeId, activePathEdges, nodes]
  );

  const handleBranchChange = useCallback((nodeId, branchId) => {
    if (hasPath(nodes, edges, branchId, nodeId)) {
      console.warn(`Переключение ветки ${nodeId} → ${branchId} образует цикл, отменяю.`);
      return;
    }
    setNodes(nds => nds.map(node => 
      node.id === nodeId ? { 
        ...node, 
        data: { 
          ...node.data, 
          activeBranch: branchId 
        } 
      } : node
    ));
  
  }, [edges]); 

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
      zIndex: 1000, // Высокий z-index для отображения поверх
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
      type: 'bezier',
      timestamp: Date.now(),
    };
  
    setNodes(nds => [...nds, newNode]);
    setEdges(eds => [...eds, newEdge]);
    setNextId(prev => prev + 1);
  }, [nodes, nextId, setNodes, setEdges]); 


  const handleCloneNode = useCallback((nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
  
    const newId = nextId.toString();
    const newNode = {
      ...node,
      id: newId,
      position: { 
        x: node.position.x + 20, 
        y: node.position.y + 20 
      },
      zIndex: 1000, // Высокий z-index для отображения поверх
      data: {
        ...node.data,
        branches: [],
        activeBranch: null
      }
    };
  
    // Обновляем z-index всех нод и добавляем новую на передний план
    setNodes(nds => {
      const updatedNodes = nds.map(n => ({ ...n, zIndex: (n.zIndex || 0) - 1 }));
      return [...updatedNodes, { ...newNode, zIndex: 1000 }];
    });
    setNextId(prev => prev + 1);
    
    // Выбираем новую ноду после клонирования
    requestAnimationFrame(() => {
      setSelectedNodeId(newId);
      onNodesChange([{ type: 'select', id: newId }]);
    });
  }, [nodes, nextId, setNodes, onNodesChange]);
  
  const handleNodeCopy = useCallback((nodeId) => {
    // Не выбираем ноду при копировании через правый клик
    // setSelectedNodeId(nodeId);
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
    const edgeToDelete = edges.find(e => e.id === edgeId);
    
    setEdges((eds) => eds.filter(e => e.id !== edgeId));
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
    
    // Если удаляемое ребро было активной веткой, очищаем activeBranch
    if (edgeToDelete) {
      setNodes((nds) => nds.map(node => {
        if (node.data.activeBranch === edgeToDelete.target) {
          return {
            ...node,
            data: {
              ...node.data,
              activeBranch: null
            }
          };
        }
        return node;
      }));
    }
  }, [selectedEdgeId, setEdges, edges, setNodes]);

  const handleDeleteNode = useCallback((nodeId) => { deleteNode(nodeId); }, [deleteNode]);

  const handleAddConnectionPoint = useCallback((nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const newConnectionPointId = `cp_${nextConnectionPointId}`;
    const newPosition = {
      x: node.position.x + 150,
      y: node.position.y + 50
    };

    const newConnectionPoint = {
      id: newConnectionPointId,
      type: 'connectionPoint',
      position: newPosition,
      zIndex: 1000,
      data: {
        label: `Точка ${nextConnectionPointId}`,
        parentNodeId: nodeId,
        onConnectionPointClick: handleConnectionPointClick,
        onConnectionPointDelete: handleDeleteConnectionPoint,
        onHandleDoubleClick: handleHandleDoubleClick,
      },
    };

    setNodes(nds => [...nds, newConnectionPoint]);
    setNextConnectionPointId(prev => prev + 1);
  }, [nodes, nextConnectionPointId, setNodes]);

  const handleConnectionPointClick = useCallback((connectionPointId) => {
    setSelectedNodeId(connectionPointId);
  }, []);

  const handleDeleteConnectionPoint = useCallback((connectionPointId) => {
    setNodes(nds => nds.filter(node => node.id !== connectionPointId));
    setEdges(eds => eds.filter(edge => edge.source !== connectionPointId && edge.target !== connectionPointId));
    if (selectedNodeId === connectionPointId) setSelectedNodeId(null);
  }, [selectedNodeId, setEdges, setNodes]);  

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

        // Очищаем глобальный selectedId перед вставкой
        setSelectedNodeId(null);
        setSelectedEdgeId(null);

        const pastedNodes = copiedSelection.nodes.map(n => {
          const newId = String(idCounter++);
          newIdMap[n.id] = newId;
          lastNewId = newId;
          return {
            ...n,
            id: newId,
            position: { x: n.position.x + 10, y: n.position.y + 10 },
            zIndex: 1000, // Высокий z-index для отображения поверх
            data: {
              ...n.data,
              branches: [],
              activeBranch: null
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

        // Обновляем z-index всех нод и добавляем вставленные на передний план
        setNodes(nds => {
          const updatedNodes = nds.map(n => ({ ...n, zIndex: (n.zIndex || 0) - 1 }));
          const updatedPastedNodes = pastedNodes.map(n => ({ ...n, zIndex: 1000 }));
          return [...updatedNodes, ...updatedPastedNodes];
        });
        setEdges(eds => [...eds, ...pastedEdges]);
        setNextId(idCounter);

        // Выделяем последнюю вставленную ноду
        if (lastNewId) {
          // Используем requestAnimationFrame для гарантии обновления DOM
          requestAnimationFrame(() => {
            setSelectedNodeId(lastNewId);
            // Принудительно обновляем React Flow
            onNodesChange([{ type: 'select', id: lastNewId }]);
          });
        }
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
      if (nodes.length > 1) return;

      const params = new URLSearchParams(window.location.search);
      const compressedState = params.get('state');
      
      if (compressedState) {
        try {
          const stateStr = decompressFromEncodedURIComponent(compressedState);
          const parsedState = JSON.parse(stateStr);
  
          const restoredNodes = parsedState.nodes.map(node => ({
            ...node,
            type: 'custom',
            position: node.position || { x: 100, y: 100 },
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
  
          setNodes(restoredNodes);
          setEdges(parsedState.edges);
          setNextId(parsedState.nextId);
        } catch (e) {
          console.error('Ошибка загрузки сохранённого состояния:', e);
        }
      }
    };
    
    loadState();
  }, [setEdges, setNodes, nodes.length]); 
      

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
    
    if (hasPath(nodes, edges, target, source)) {
      console.warn(`Связь ${source} → ${target} образует цикл, отменяю.`);
      return;
    }
  
    const newEdge = {
      ...params,
      type: 'default',
      timestamp: Date.now(),
    };
    
    // Если подключаемся к точке соединения, обновляем activeBranch родительской ноды
    const targetNode = nodes.find(n => n.id === target);
    if (targetNode?.type === 'connectionPoint') {
      const parentNodeId = targetNode.data.parentNodeId;
      setNodes(nds => nds.map(node => 
        node.id === parentNodeId ? { 
          ...node, 
          data: { 
            ...node.data, 
            activeBranch: target 
          } 
        } : node
      ));
    }
    
    setEdges(eds => addEdge(newEdge, eds));
  }, [nodes, edges, setEdges]);

  
  // Функция для создания радужного DARKWIN777
  const createRainbowText = useCallback((text) => {
    if (!text) return text;
    
    const rainbowColors = [
      '#e40303', // красный
      '#ff8c00', // оранжевый
      '#ffed00', // желтый
      '#008026', // зеленый
      '#004dff', // синий
      '#750787'  // фиолетовый
    ];
    
    // Заменяем DARKWIN777 на радужную версию
    return text.replace(/DARKWIN777/gi, (match) => {
      return match.split('').map((char, index) => {
        const colorIndex = index % rainbowColors.length;
        return `<span style="color: ${rainbowColors[colorIndex]}; font-weight: bold;">${char}</span>`;
      }).join('');
    });
  }, []);

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

    const chain = getChain('1').join(' ');
    return createRainbowText(chain);
  }, [nodes, createRainbowText]);

  const nodesWithHandlers = useMemo(() => 
    nodes.map((node) => ({
      ...node,
      position: node.position || { x: 100, y: 100 },
      data: {
        ...node.data,
        activePathNodes,
        selected: node.id === selectedNodeId,
        onNodeCopy: handleNodeCopy,
        onNodeClick: handleNodeClick,
        onNodeDoubleClick: handleNodeDoubleClick,
        onBranchChange: handleBranchChange,
        onHandleDoubleClick: handleHandleDoubleClick,
        onDeleteNode: handleDeleteNode,
        onCloneNode: handleCloneNode,
        onEditNode: handleNodeDoubleClick,
        onAddConnectionPoint: handleAddConnectionPoint,
        createRainbowText: createRainbowText
      }    
    }))
  , [nodes, activePathNodes, selectedNodeId, handleHandleDoubleClick, handleDeleteNode, handleCloneNode, handleNodeDoubleClick, handleNodeCopy, handleNodeClick, handleBranchChange, handleAddConnectionPoint, createRainbowText]);

  return (
    <>
      {/* Табличка ButterFly */}
      <div className="butterfly-badge">
        ButterFly
      </div>
      
      <Split
        sizes={[25, 75]}
        minSize={[200, 300]}
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
            backgroundColor: '#d1462f',
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
      <h3 style={{ color: '#d1462f', marginBottom: 15 }}>Текущая цепочка</h3>
      <div style={{ 
        whiteSpace: 'pre-wrap', 
        border: '1px solid #292929',
        padding: 8,
        height: '80vh',
        overflowY: 'auto',
        background: '#131313',
        borderRadius: 0,
        lineHeight: '1.4'
      }}
      dangerouslySetInnerHTML={{ __html: getFullChain() }}
      />

    <h3 style={{ color: '#d1462f', marginBottom: 15 }}>Поделиться</h3>
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
      Очистить Холст
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

            onSelectionChange={(elements) => {
              // Обрабатываем множественный выбор
              if (elements.nodes.length > 0) {
                setSelectedNodeId(elements.nodes[0].id);
              } else {
                setSelectedNodeId(null);
              }
              
              if (elements.edges.length > 0) {
                setSelectedEdgeId(elements.edges[0].id);
              } else {
                setSelectedEdgeId(null);
              }
            }}

            snapToGrid={true}
            snapGrid={[20, 20]}


            nodeTypes={nodeTypes}
            zoomOnScroll={true}
            zoomOnPinch={true}
            panOnScroll={false} 
            panOnDrag={true}
            preventScrolling={false}
            multiSelectionKeyCode="Shift"
            selectionKeyCode="Shift"
                    
            defaultEdgeOptions={{
              type: 'bezier',
              style: {
                stroke: '#555555',
                strokeWidth: 1.5,
                strokeDasharray: '5 5',
              },
            }}
            proOptions={{ hideAttribution: true }} 

            fitView

            colorMode="dark"
                        
          >
            <Background gap={20} size={1.25}     color="#606060"     
            variant="dots"     
            style={{ 
              background: '#0e0e0e', 
              mixBlendMode: 'normal' 
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
            className="editing-panel" 
            style={{ 
              padding: 15,
              background: '#1b1b1d', 
              borderTop: '3px solid #0c0c0c',
              boxShadow: '0 -10px 10px rgba(0,0,0,0.3)',
              zIndex: 10,
              color: '#bfbfbf', 
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: '50vh',
              overflowY: 'auto'
            }}
          >
              <h4 style={{ margin: '0 0 15px 0', color: '#d1462f' }}>Редактирование ноды {editingNodeId }</h4>
            
            <div style={{ marginBottom: 15 }}>
              <div style={{ fontSize: 12, marginBottom: 6, fontWeight: 'bold' }}>Заголовок:</div>
              <input
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                style={{
                  width: '100%', 
                  padding: 8, 
                  fontSize: 14, 
                  background: '#2a2a2d', 
                  color: '#bfbfbf', 
                  border: '1px solid #292929',
                  borderRadius: 4,
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            <div style={{ marginBottom: 15 }}>
              <div style={{ fontSize: 12, marginBottom: 6, fontWeight: 'bold' }}>Содержание:</div>
              
              {/* Панель форматирования */}
              <div className="formatting-toolbar">
                <button 
                  className="format-btn"
                  onClick={() => {
                    const textarea = document.querySelector('.editing-panel textarea');
                    if (textarea) {
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const selectedText = editingContent.substring(start, end);
                      const newText = editingContent.substring(0, start) + 
                        `<b>${selectedText || 'жирный текст'}</b>` + 
                        editingContent.substring(end);
                      setEditingContent(newText);
                    }
                  }}
                  title="Жирный текст"
                >
                  B
                </button>
                
                <button 
                  className="format-btn"
                  onClick={() => {
                    const textarea = document.querySelector('.editing-panel textarea');
                    if (textarea) {
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const selectedText = editingContent.substring(start, end);
                      const newText = editingContent.substring(0, start) + 
                        `<i>${selectedText || 'курсив'}</i>` + 
                        editingContent.substring(end);
                      setEditingContent(newText);
                    }
                  }}
                  title="Курсив"
                >
                  I
                </button>
                
                <button 
                  className="format-btn"
                  onClick={() => {
                    const textarea = document.querySelector('.editing-panel textarea');
                    if (textarea) {
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const selectedText = editingContent.substring(start, end);
                      const newText = editingContent.substring(0, start) + 
                        `<u>${selectedText || 'подчеркнутый текст'}</u>` + 
                        editingContent.substring(end);
                      setEditingContent(newText);
                    }
                  }}
                  title="Подчеркнутый текст"
                >
                  U
                </button>
                
                <div className="color-picker">
                  <input
                    type="color"
                    defaultValue="#bfbfbf"
                    onChange={(e) => {
                      const textarea = document.querySelector('.editing-panel textarea');
                      if (textarea) {
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const selectedText = editingContent.substring(start, end);
                        
                        // Если выделен текст, применяем цвет к нему
                        if (selectedText) {
                          const newText = editingContent.substring(0, start) + 
                            `<span style="color: ${e.target.value}">${selectedText}</span>` + 
                            editingContent.substring(end);
                          setEditingContent(newText);
                        } else {
                          // Если ничего не выделено, добавляем цветной текст в конец
                          const newText = editingContent + `<span style="color: ${e.target.value}">цветной текст</span>`;
                          setEditingContent(newText);
                        }
                      }
                    }}
                    title="Цвет текста"
                  />
                </div>
                
                <button 
                  className="format-btn"
                  onClick={() => {
                    const textarea = document.querySelector('.editing-panel textarea');
                    if (textarea) {
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const selectedText = editingContent.substring(start, end);
                      const newText = editingContent.substring(0, start) + 
                        `<br/>` + 
                        editingContent.substring(end);
                      setEditingContent(newText);
                    }
                  }}
                  title="Новая строка"
                >
                  ↵
                </button>
                
                <button 
                  className="format-btn"
                  onClick={() => {
                    const textarea = document.querySelector('.editing-panel textarea');
                    if (textarea) {
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const selectedText = editingContent.substring(start, end);
                      const newText = editingContent.substring(0, start) + 
                        `<span style="background-color: #d1462f; color: #ffffff; padding: 2px 4px; border-radius: 2px;">${selectedText || 'выделенный текст'}</span>` + 
                        editingContent.substring(end);
                      setEditingContent(newText);
                    }
                  }}
                  title="Выделить текст"
                >
                  🎨
                </button>
                
                <button 
                  className="format-btn"
                  onClick={() => {
                    // Очищаем HTML-теги, оставляя только текст
                    const cleanText = editingContent.replace(/<[^>]*>/g, '');
                    setEditingContent(cleanText);
                  }}
                  title="Очистить форматирование"
                  style={{ background: '#ee6a6a', color: '#ffffff' }}
                >
                  🧹
                </button>
                
                <button 
                  className="format-btn"
                  onClick={() => {
                    // Умная очистка - объединяем одинаковые цветные span'ы
                    let cleanedText = editingContent;
                    
                    // Заменяем множественные span'ы с одинаковым цветом на один
                    cleanedText = cleanedText.replace(/(<span style="color: ([^"]+)">[^<]*<\/span>)+/g, (match) => {
                      const colorMatch = match.match(/color: ([^"]+)/);
                      if (colorMatch) {
                        const color = colorMatch[1];
                        const textContent = match.replace(/<[^>]*>/g, '');
                        return `<span style="color: ${color}">${textContent}</span>`;
                      }
                      return match;
                    });
                    
                    setEditingContent(cleanedText);
                  }}
                  title="Оптимизировать HTML"
                  style={{ background: '#59e7a8', color: '#000000' }}
                >
                  ⚡
                </button>
                
                <button 
                  className="format-btn"
                  onClick={() => {
                    const textarea = document.querySelector('.editing-panel textarea');
                    if (textarea) {
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const newText = editingContent.substring(0, start) + 
                        'DARKWIN777' + 
                        editingContent.substring(end);
                      setEditingContent(newText);
                    }
                  }}
                  title="Добавить DARKWIN777 (радужный)"
                  style={{ background: 'linear-gradient(45deg, #e40303, #ff8c00, #ffed00, #008026, #004dff, #750787)', color: '#ffffff' }}
                >
                  🌈
                </button>
              </div>
              
              <textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                style={{
                  width: '100%', 
                  padding: 8, 
                  fontSize: 14, 
                  minHeight: 120, 
                  background: '#2a2a2d', 
                  color: '#bfbfbf', 
                  border: '1px solid #292929',
                  borderRadius: 4,
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              onClick={() => {
                updateNodeLabel(editingNodeId, editingTitle, editingContent);
                setEditingNodeId(null); 
              }}
              style={{ 
                background: '#d1462f',
                color: '#ffffff',
                border: '1px solid #b83d2a',
                padding: '10px 20px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 'bold',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#b83d2a';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = '#d1462f';
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
              background: '#d1462f',
              color: '#fff',
            },
          }}
        >
          Удалить связь
        </button>
      </div>
    )}

    </Split>
    </>
  );
}

export default App;
